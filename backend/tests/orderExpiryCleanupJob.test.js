const { startOrderExpiryCleanupJob, getIntervalMs, DEFAULT_INTERVAL_MS } = require('../src/jobs/orderExpiryCleanupJob');
let job;
beforeEach(() => jest.useFakeTimers());
afterEach(async () => {
  if (job) await job.stop();
  job = undefined;
  delete process.env.ORDER_EXPIRY_CLEANUP_INTERVAL_MS;
  jest.useRealTimers();
});
test('Runs at startup, then every minute; logs only the committed count and stops cleanly', async () => {
  const cleanup = jest.fn().mockResolvedValueOnce(3).mockResolvedValue(0);
  const logger = { info: jest.fn(), error: jest.fn() };
  job = startOrderExpiryCleanupJob({ cleanup, logger });
  await job.ready;
  expect(logger.info).toHaveBeenCalledWith('[OrderExpiryCleanup] expired=3');
  await jest.advanceTimersByTimeAsync(59999);
  expect(cleanup).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(cleanup).toHaveBeenCalledTimes(2);
  expect(logger.info).toHaveBeenLastCalledWith('[OrderExpiryCleanup] expired=0');
  await job.stop();
  await jest.advanceTimersByTimeAsync(60000);
  expect(cleanup).toHaveBeenCalledTimes(2);
});
test('A slow pass cannot overlap; shutdown waits for its commit', async () => {
  let resolve;
  const cleanup = jest.fn(() => new Promise((r) => { resolve = r; }));
  job = startOrderExpiryCleanupJob({ cleanup, logger: { info: jest.fn(), error: jest.fn() } });
  await jest.advanceTimersByTimeAsync(120000);
  expect(cleanup).toHaveBeenCalledTimes(1);
  const stopped = job.stop();
  resolve(1);
  await stopped;
  await jest.advanceTimersByTimeAsync(120000);
  expect(cleanup).toHaveBeenCalledTimes(1);
});
test('Database failure retries next minute without logging private payloads or SQL', async () => {
  const cleanup = jest.fn().mockRejectedValueOnce(new Error('private-order buyer@example.test secret')).mockResolvedValue(2);
  const logger = { info: jest.fn(), error: jest.fn() };
  job = startOrderExpiryCleanupJob({ cleanup, logger });
  await job.ready;
  expect(logger.error.mock.calls).toEqual([['[OrderExpiryCleanup] Cleanup failed; will retry.']]);
  await jest.advanceTimersByTimeAsync(60000);
  expect(logger.info).toHaveBeenCalledWith('[OrderExpiryCleanup] expired=2');
});
test.each(['', '-1', '10junk', '1.5', '0', '2147483648', '1000'])('Validates the interval: %s', (value) => {
  process.env.ORDER_EXPIRY_CLEANUP_INTERVAL_MS = value;
  expect(getIntervalMs()).toBe(value === '1000' ? 1000 : DEFAULT_INTERVAL_MS);
});
