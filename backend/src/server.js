require('dotenv').config();
const db = require('./config/database');
const { createPaymentRuntime } = require('./config/paymentRuntime');
const { PaymentConfigurationError } = require('./config/paymentProviderConfig');
const { startSeatHoldCleanupJob } = require('./jobs/seatHoldCleanupJob');
const { startOrderExpiryCleanupJob } = require('./jobs/orderExpiryCleanupJob');

const startServer = async ({ port = process.env.PORT || 3000, app: suppliedApp,
  runtimeFactory = createPaymentRuntime } = {}) => {
  // Validate and construct the selected adapter before jobs or HTTP listeners.
  const runtime = runtimeFactory();
  const application = suppliedApp || require('./app').createApp({
    paymentService: runtime.paymentService,
    paymentResultService: runtime.paymentResultService,
    paymentGateway: runtime.gateway,
    paymentProvider: runtime.configuration.provider,
  });
  const jobs = [startSeatHoldCleanupJob(), startOrderExpiryCleanupJob()];
  await Promise.all(jobs.map((job) => job.ready));
  const server = application.listen(port, () => console.log(`Server is running on port ${port}`));
  let closing;
  const close = () => {
    if (!closing) {
      closing = (async () => {
        process.removeListener('SIGTERM', shutdown);
        process.removeListener('SIGINT', shutdown);
        await new Promise((resolve) => server.close(resolve));
        await Promise.all(jobs.map((job) => job.stop()));
        await db.destroy();
      })();
    }
    return closing;
  };
  const shutdown = () => {
    close().catch(() => {
      console.error('[Server] Shutdown failed.');
      process.exitCode = 1;
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  server.on('error', shutdown);
  return { server, close, paymentRuntime: runtime };
};
if (require.main === module) {
  startServer().catch((error) => {
    console.error(error instanceof PaymentConfigurationError
      ? `[Server] Payment configuration invalid: ${error.message}`
      : '[Server] Startup failed.');
    process.exitCode = 1;
  });
}
module.exports = { startServer };
