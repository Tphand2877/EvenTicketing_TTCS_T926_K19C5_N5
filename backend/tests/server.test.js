const { EventEmitter } = require('events');
const mockDestroy = jest.fn().mockResolvedValue();
const mockStop = jest.fn().mockResolvedValue();
const mockOrderStop = jest.fn().mockResolvedValue();
let mockReady;
let mockOrderReady;
jest.mock('../src/app', () => ({}));
jest.mock('../src/config/database', () => ({ destroy: mockDestroy }));
jest.mock('../src/jobs/seatHoldCleanupJob', () => ({
  startSeatHoldCleanupJob: jest.fn(() => ({ ready: mockReady, stop: mockStop })),
}));
jest.mock('../src/jobs/orderExpiryCleanupJob', () => ({
  startOrderExpiryCleanupJob: jest.fn(() => ({ ready: mockOrderReady, stop: mockOrderStop })),
}));
const { startServer } = require('../src/server');
beforeEach(() => {
  jest.clearAllMocks();
  mockReady = Promise.resolve();
  mockOrderReady = Promise.resolve();
});
test('Server waits for startup cleanup and closes HTTP, scheduler and DB exactly once', async () => {
  let ready;
  let ordersReady;
  mockReady = new Promise((resolve) => { ready = resolve; });
  mockOrderReady = new Promise((resolve) => { ordersReady = resolve; });
  const server = new EventEmitter();
  server.close = jest.fn((callback) => callback());
  const application = { listen: jest.fn(() => server) };
  const started = startServer({ app: application, port: 3000, runtimeFactory: () => ({}) });
  expect(application.listen).not.toHaveBeenCalled();
  ready();
  await Promise.resolve();
  expect(application.listen).not.toHaveBeenCalled();
  ordersReady();
  const runtime = await started;
  expect(application.listen).toHaveBeenCalledTimes(1);
  await Promise.all([runtime.close(), runtime.close()]);
  expect(server.close).toHaveBeenCalledTimes(1);
  expect(mockStop).toHaveBeenCalledTimes(1);
  expect(mockOrderStop).toHaveBeenCalledTimes(1);
  expect(mockDestroy).toHaveBeenCalledTimes(1);
});

test('invalid payment configuration prevents jobs and the HTTP listener', async () => {
  const application = { listen: jest.fn() };
  await expect(startServer({ app: application, runtimeFactory: () => {
    throw new Error('Mock payment gateway is forbidden in production.');
  } })).rejects.toThrow('forbidden in production');
  expect(application.listen).not.toHaveBeenCalled();
  expect(require('../src/jobs/seatHoldCleanupJob').startSeatHoldCleanupJob).not.toHaveBeenCalled();
});
