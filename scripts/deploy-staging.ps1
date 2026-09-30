$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$composeArgs = @('compose', '-p', 'eventticketing-staging', '-f', 'docker-compose.staging.yml')
$replacedContainers = $false

function Invoke-Docker {
    param([string[]]$DockerArgs)

    & docker @DockerArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Docker failed (exit code $LASTEXITCODE): docker $($DockerArgs -join ' ')"
    }
}

function Invoke-Compose {
    param([string[]]$CommandArgs)

    Invoke-Docker -DockerArgs ($composeArgs + $CommandArgs)
}

function Get-ImageId {
    param([string]$Name)

    $imageId = & docker image inspect --format '{{.Id}}' $Name 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $null
    }
    return "$imageId".Trim()
}

function Wait-Healthy {
    param([string]$Service)

    $containerId = & docker @composeArgs ps -q $Service
    if ($LASTEXITCODE -ne 0 -or -not $containerId) {
        throw "Cannot find staging container: $Service"
    }

    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        $status = & docker inspect --format '{{.State.Health.Status}}' $containerId 2>$null
        if ($status -eq 'healthy') {
            return
        }
        if ($status -eq 'unhealthy') {
            throw "Staging service is unhealthy: $Service"
        }
        Start-Sleep -Seconds 2
    }
    throw "Timed out waiting for staging service: $Service"
}

Write-Host 'Checking Docker and staging configuration...'
Invoke-Docker -DockerArgs @('info', '--format', '{{.ServerVersion}}')
Invoke-Compose -CommandArgs @('config', '--quiet')

$oldBackend = Get-ImageId 'eventticketing-backend:staging'
$oldFrontend = Get-ImageId 'eventticketing-frontend:staging'
$canRollback = $oldBackend -and $oldFrontend

if ($canRollback) {
    Invoke-Docker -DockerArgs @('tag', $oldBackend, 'eventticketing-backend:rollback')
    Invoke-Docker -DockerArgs @('tag', $oldFrontend, 'eventticketing-frontend:rollback')
}

try {
    Write-Host 'Building images while the previous staging containers keep running...'
    Invoke-Compose -CommandArgs @('build', 'backend', 'frontend')

    Write-Host 'Starting PostgreSQL and applying database migrations...'
    Invoke-Compose -CommandArgs @('up', '-d', 'postgres')
    Wait-Healthy 'postgres'
    Invoke-Compose -CommandArgs @('run', '--rm', '--no-deps', 'backend', 'npm', 'run', 'migrate')

    Write-Host 'Starting the new backend and frontend...'
    $replacedContainers = $true
    Invoke-Compose -CommandArgs @('up', '-d', '--no-build', '--force-recreate', 'backend', 'frontend')
    Wait-Healthy 'backend'
    Wait-Healthy 'frontend'

    $backendResponse = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/health' -UseBasicParsing -TimeoutSec 10
    $frontendResponse = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/' -UseBasicParsing -TimeoutSec 10
    if ($backendResponse.StatusCode -ne 200 -or $frontendResponse.StatusCode -ne 200) {
        throw 'Staging HTTP checks failed.'
    }

    Write-Host 'Staging deployment passed: backend and frontend are healthy.'
    Invoke-Compose -CommandArgs @('ps')
}
catch {
    Write-Warning "Staging deployment failed: $_"
    try {
        Invoke-Compose -CommandArgs @('ps')
        Invoke-Compose -CommandArgs @('logs', '--tail', '80', 'backend', 'frontend')
    }
    catch {
        Write-Warning "Could not collect staging logs: $_"
    }

    if ($canRollback) {
        Write-Host 'Restoring the previous application images...'
        Invoke-Docker -DockerArgs @('tag', 'eventticketing-backend:rollback', 'eventticketing-backend:staging')
        Invoke-Docker -DockerArgs @('tag', 'eventticketing-frontend:rollback', 'eventticketing-frontend:staging')
        if ($replacedContainers) {
            Invoke-Compose -CommandArgs @('up', '-d', '--no-build', '--force-recreate', 'backend', 'frontend')
        }
    }

    throw
}
