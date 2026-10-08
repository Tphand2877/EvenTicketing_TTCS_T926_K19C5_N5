const { startSeatHoldCleanupJob, getIntervalMs, DEFAULT_INTERVAL_MS } = require('../src/jobs/seatHoldCleanupJob');
let job;
beforeEach(() => jest.useFakeTimers());
afterEach(async () => {
  if (job) await job.stop();
  job = undefined;
  delete process.env.SEAT_HOLD_CLEANUP_INTERVAL_MS;
  jest.useRealTimers();
});
test('Runs immediately on startup and repeats without any request', async () => {
  const cleanup = jest.fn().mockResolvedValue(2);
  job = startSeatHoldCleanupJob({ cleanup, intervalMs: 100 });
  await job.ready;
  expect(cleanup).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(100);
  expect(cleanup).toHaveBeenCalledTimes(2);
  await job.stop();
  await jest.advanceTimersByTimeAsync(1000);
  expect(cleanup).toHaveBeenCalledTimes(2);
});
test('A slow cleanup never overlaps with another run; stop waits for completion', async () => {
  let resolve;
  const cleanup = jest.fn(() => new Promise((r) => { resolve = r; }));
  job = startSeatHoldCleanupJob({ cleanup, intervalMs: 100 });
  await jest.advanceTimersByTimeAsync(1000);
  expect(cleanup).toHaveBeenCalledTimes(1);
  const stopped = job.stop();
  resolve(0);
  await stopped;
  await jest.advanceTimersByTimeAsync(1000);
  expect(cleanup).toHaveBeenCalledTimes(1);
});
test('Database failure is retried and the error log contains no personal/payment data', async () => {
  const cleanup = jest.fn().mockRejectedValueOnce(new Error('buyer@example.test payment-secret')).mockResolvedValue(1);
  const logger = { error: jest.fn() };
  job = startSeatHoldCleanupJob({ cleanup, intervalMs: 100, logger });
  await job.ready;
  expect(logger.error).toHaveBeenCalledWith('[SeatHoldCleanup] Cleanup failed; will retry.');
  await jest.advanceTimersByTimeAsync(100);
  expect(cleanup).toHaveBeenCalledTimes(2);
});
test.each(['', '-1', '10junk', '1.5', '0', '2147483648', '1000'])('Interval validation: %s', (value) => {
  process.env.SEAT_HOLD_CLEANUP_INTERVAL_MS = value;
  expect(getIntervalMs()).toBe(value === '1000' ? 1000 : DEFAULT_INTERVAL_MS);
});
