const { spawnSync } = require('child_process');
const result = spawnSync(process.execPath, [
  require.resolve('jest/bin/jest'), '--runInBand', 'tests/seatHold.integration.test.js',
], { stdio: 'inherit', env: { ...process.env, RUN_SEAT_HOLD_DB_TESTS: '1' } });
process.exitCode = result.status ?? 1;
