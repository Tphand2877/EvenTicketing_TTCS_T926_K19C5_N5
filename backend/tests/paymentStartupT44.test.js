const { spawnSync } = require('child_process');
const path = require('path');

test('production mock exits nonzero before binding a listener', () => {
  const safeEnv = { ...process.env };
  delete safeEnv.PAYMENT_GATEWAY;
  const result = spawnSync(process.execPath, [path.join(__dirname, '../src/server.js')], {
    cwd: path.join(__dirname, '..'),
    env: { ...safeEnv, NODE_ENV: 'development', DEPLOY_ENV: 'production', PAYMENT_PROVIDER: 'mock', PORT: '0' },
    encoding: 'utf8', timeout: 5000,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Mock payment gateway is forbidden in production');
  expect(result.stdout).not.toContain('Server is running');
});
