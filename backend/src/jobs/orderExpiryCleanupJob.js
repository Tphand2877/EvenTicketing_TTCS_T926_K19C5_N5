const service = require('../services/orderExpiryService');
const DEFAULT_INTERVAL_MS = 60000;
const getIntervalMs = () => {
  const value = Number(process.env.ORDER_EXPIRY_CLEANUP_INTERVAL_MS);
  return Number.isSafeInteger(value) && value >= 100 && value <= 2147483647 ? value : DEFAULT_INTERVAL_MS;
};
const startOrderExpiryCleanupJob = ({ cleanup = () => service.cleanupExpired(), intervalMs = getIntervalMs(), logger = console } = {}) => {
  let stopped = false;
  let timer;
  let running;
  const run = () => {
    if (stopped) return Promise.resolve();
    if (running) return running;
    running = Promise.resolve().then(cleanup).then((expired) => {
      logger.info(`[OrderExpiryCleanup] expired=${expired}`);
    }).catch(() => {
      // Only counts/static text; never log order/buyer IDs, payloads or SQL errors.
      logger.error('[OrderExpiryCleanup] Cleanup failed; will retry.');
    }).finally(() => {
      running = undefined;
      if (!stopped) {
        timer = setTimeout(run, intervalMs);
        timer.unref?.();
      }
    });
    return running;
  };
  const ready = run();
  return { ready, async stop() {
    stopped = true;
    clearTimeout(timer);
    await running;
  } };
};
module.exports = { DEFAULT_INTERVAL_MS, getIntervalMs, startOrderExpiryCleanupJob };
