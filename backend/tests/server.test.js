const { EventEmitter } = require('events');
const mockDestroy = jest.fn().mockResolvedValue();
const mockStop = jest.fn().mockResolvedValue();
let mockReady;
jest.mock('../src/app', () => ({}));
jest.mock('../src/config/database', () => ({ destroy: mockDestroy }));
jest.mock('../src/jobs/seatHoldCleanupJob', () => ({
  startSeatHoldCleanupJob: jest.fn(() => ({ ready: mockReady, stop: mockStop })),
}));
const { startServer } = require('../src/server');
beforeEach(() => {
  jest.clearAllMocks();
  mockReady = Promise.resolve();
});
test('Server waits for startup cleanup and closes HTTP, scheduler and DB exactly once', async () => {
  let ready;
  mockReady = new Promise((resolve) => { ready = resolve; });
  const server = new EventEmitter();
  server.close = jest.fn((callback) => callback());
  const application = { listen: jest.fn(() => server) };
  const started = startServer({ app: application, port: 3000 });
  expect(application.listen).not.toHaveBeenCalled();
  ready();
  const runtime = await started;
  expect(application.listen).toHaveBeenCalledTimes(1);
  await Promise.all([runtime.close(), runtime.close()]);
  expect(server.close).toHaveBeenCalledTimes(1);
  expect(mockStop).toHaveBeenCalledTimes(1);
  expect(mockDestroy).toHaveBeenCalledTimes(1);
});
