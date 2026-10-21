const { createTicketEmailDispatcher } = require('../services/ticketNotificationService');

/** S-27: định kỳ gửi email vé cho các đơn đã thanh toán mà chưa gửi được (SMTP lỗi, server khởi động lại). */
const DEFAULT_INTERVAL_MS = 60000;
const getIntervalMs = () => {
  const value = Number(process.env.TICKET_EMAIL_INTERVAL_MS);
  return Number.isSafeInteger(value) && value >= 100 && value <= 2147483647 ? value : DEFAULT_INTERVAL_MS;
};

const startTicketEmailJob = ({ dispatch = () => createTicketEmailDispatcher().dispatchPending(), intervalMs = getIntervalMs(), logger = console } = {}) => {
  let stopped = false;
  let timer;
  let running;
  const run = () => {
    if (stopped) return Promise.resolve();
    if (running) return running;
    running = Promise.resolve().then(dispatch).then((sent) => {
      if (sent > 0) logger.info(`[TicketEmail] sent=${sent}`);
    }).catch(() => {
      logger.error('[TicketEmail] Dispatch failed; will retry.');
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

module.exports = { DEFAULT_INTERVAL_MS, getIntervalMs, startTicketEmailJob };
