const seatHoldService = require('../services/seatHoldService');
const DEFAULT_INTERVAL_MS = 30000;
const getIntervalMs = () => {
  const value = Number(process.env.SEAT_HOLD_CLEANUP_INTERVAL_MS);
  return Number.isSafeInteger(value) && value >= 100 && value <= 2147483647
    ? value : DEFAULT_INTERVAL_MS;
};
const startSeatHoldCleanupJob = ({
  cleanup = () => seatHoldService.cleanupExpired(),
  intervalMs = getIntervalMs(), logger = console,
} = {}) => {
  let stopped = false;
  let timer;
  let running;
  const run = () => {
    if (stopped) return Promise.resolve();
    if (running) return running;
    running = Promise.resolve().then(cleanup).catch(() => {
      // Do not log database errors, hold/user IDs or payment data.
      logger.error('[SeatHoldCleanup] Cleanup failed; will retry.');
    }).finally(() => {
      running = undefined;
      if (!stopped) {
        timer = setTimeout(run, intervalMs);
        timer.unref?.();
      }
    });
    return running;
  };
  // First run clears all outstanding expired rows, without a limited age window.
  const ready = run();
  return {
    ready,
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
  };
};
module.exports = { DEFAULT_INTERVAL_MS, getIntervalMs, startSeatHoldCleanupJob };
