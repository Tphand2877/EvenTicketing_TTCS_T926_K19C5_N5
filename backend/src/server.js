require('dotenv').config();
const app = require('./app');
const db = require('./config/database');
const { startSeatHoldCleanupJob } = require('./jobs/seatHoldCleanupJob');

const startServer = async ({ port = process.env.PORT || 3000, app: application = app } = {}) => {
  const job = startSeatHoldCleanupJob();
  await job.ready;
  const server = application.listen(port, () => console.log(`Server is running on port ${port}`));
  let closing;
  const close = () => {
    if (!closing) {
      closing = (async () => {
        process.removeListener('SIGTERM', shutdown);
        process.removeListener('SIGINT', shutdown);
        await new Promise((resolve) => server.close(resolve));
        await job.stop();
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
  return { server, close };
};
if (require.main === module) {
  startServer().catch(() => {
    console.error('[Server] Startup failed.');
    process.exitCode = 1;
  });
}
module.exports = { startServer };
