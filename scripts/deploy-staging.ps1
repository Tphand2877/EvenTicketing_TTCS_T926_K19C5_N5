$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$ComposeFile = "docker-compose.staging.yml"
$StagingProject = "eventticketing-staging"

$BackendImage = "eventticketing-backend:staging"
$FrontendImage = "eventticketing-frontend:staging"

$RollbackBackendImage = "eventticketing-backend:rollback"
$RollbackFrontendImage = "eventticketing-frontend:rollback"

$CandidateBackend = "eventticketing-candidate-backend"
$CandidateFrontend = "eventticketing-candidate-frontend"

$StagingBackend = "eventticketing-staging-backend"
$StagingFrontend = "eventticketing-staging-frontend"


function Run-Docker {
    & docker @args

    if ($LASTEXITCODE -ne 0) {
        throw "Docker command failed: docker $($args -join ' ')"
    }
}


function Container-Exists {
    param([string]$Name)

    $result = docker ps -a `
        --filter "name=^/$Name$" `
        --format "{{.Names}}"

    return $result -eq $Name
}


function Wait-Url {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 30
    )

    for ($i = 0; $i -lt $TimeoutSeconds; $i++) {
        try {
            $response = Invoke-WebRequest `
                -Uri $Url `
                -UseBasicParsing `
                -TimeoutSec 2

            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                return $true
            }
        }
        catch {
        }

        Start-Sleep -Seconds 1
    }

    return $false
}


function Wait-Healthy {
    param(
        [string]$Container,
        [int]$TimeoutSeconds = 60
    )

    for ($i = 0; $i -lt $TimeoutSeconds; $i++) {
        try {
            $status = docker inspect `
                --format "{{.State.Health.Status}}" `
                $Container 2>$null

            if ($status -eq "healthy") {
                return $true
            }

            if ($status -eq "unhealthy") {
                return $false
            }
        }
        catch {
        }

        Start-Sleep -Seconds 1
    }

    return $false
}


function Cleanup-Candidates {
    docker rm -f $CandidateBackend 2>$null | Out-Null
    docker rm -f $CandidateFrontend 2>$null | Out-Null
}


Write-Host ""
Write-Host "=== EventTicketing Local Staging Deployment ==="
Write-Host ""


# -------------------------------------------------
# 1. Verify candidate images
# -------------------------------------------------

Write-Host "[1/6] Checking staging images..."

Run-Docker image inspect $BackendImage
Run-Docker image inspect $FrontendImage

Write-Host "Images found."


# -------------------------------------------------
# 2. Start candidate containers
# -------------------------------------------------

Write-Host "[2/6] Starting candidate containers..."

Cleanup-Candidates

Run-Docker run `
    -d `
    --name $CandidateBackend `
    -p 3001:3000 `
    -e PORT=3000 `
    -e FRONTEND_URL=http://localhost:8081 `
    $BackendImage

Run-Docker run `
    -d `
    --name $CandidateFrontend `
    -p 8081:80 `
    $FrontendImage


# -------------------------------------------------
# 3. Candidate health check
# -------------------------------------------------

Write-Host "[3/6] Checking candidate health..."

$backendCandidateHealthy = Wait-Url `
    -Url "http://localhost:3001/health"

$frontendCandidateHealthy = Wait-Url `
    -Url "http://localhost:8081"


if (-not $backendCandidateHealthy -or -not $frontendCandidateHealthy) {

    Write-Host ""
    Write-Host "Candidate FAILED health check."

    Write-Host ""
    Write-Host "--- Backend logs ---"
    docker logs $CandidateBackend

    Write-Host ""
    Write-Host "--- Frontend logs ---"
    docker logs $CandidateFrontend

    Cleanup-Candidates

    Write-Host ""
    Write-Host "Old environment was NOT touched."
    exit 1
}


Write-Host "Candidate health check PASSED."

Cleanup-Candidates


# -------------------------------------------------
# 4. Save current staging version for rollback
# -------------------------------------------------

Write-Host "[4/6] Preparing rollback version..."

$HadOldStaging = Container-Exists $StagingBackend

$HadDevEnvironment = `
    (Container-Exists "eventticketing-backend") -and `
    (Container-Exists "eventticketing-frontend")


if ($HadOldStaging) {

    Write-Host "Saving current staging containers for rollback..."

    Run-Docker commit `
        $StagingBackend `
        $RollbackBackendImage

    Run-Docker commit `
        $StagingFrontend `
        $RollbackFrontendImage

    Write-Host "Previous staging images saved."
}


# -------------------------------------------------
# 5. Replace current environment
# -------------------------------------------------

Write-Host "[5/6] Deploying new staging version..."


if ($HadOldStaging) {

    Run-Docker compose `
        -p $StagingProject `
        -f $ComposeFile `
        down
}
elseif ($HadDevEnvironment) {

    Write-Host "Stopping current development stack..."

    Run-Docker compose down
}


Run-Docker compose `
    -p $StagingProject `
    -f $ComposeFile `
    up `
    -d


# -------------------------------------------------
# 6. Final health check
# -------------------------------------------------

Write-Host "[6/6] Checking deployed containers..."

$backendHealthy = Wait-Healthy $StagingBackend
$frontendHealthy = Wait-Healthy $StagingFrontend


if ($backendHealthy -and $frontendHealthy) {

    Write-Host ""
    Write-Host "======================================="
    Write-Host "DEPLOYMENT SUCCESSFUL"
    Write-Host "======================================="
    Write-Host ""
    Write-Host "Frontend: http://localhost:8080"
    Write-Host "Backend : http://localhost:3000/health"

    exit 0
}


Write-Host ""
Write-Host "New deployment FAILED."
Write-Host "Starting rollback..."


Run-Docker compose `
    -p $StagingProject `
    -f $ComposeFile `
    down


if ($HadOldStaging) {

    Run-Docker tag `
        $RollbackBackendImage `
        $BackendImage

    Run-Docker tag `
        $RollbackFrontendImage `
        $FrontendImage

    Run-Docker compose `
        -p $StagingProject `
        -f $ComposeFile `
        up `
        -d

    Write-Host "Previous staging version restored."
}
elseif ($HadDevEnvironment) {

    Write-Host "Restoring original development stack..."

    Run-Docker compose up -d
}


Write-Host ""
Write-Host "ROLLBACK COMPLETED"
exit 1