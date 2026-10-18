const { createOrderExpiryService, BATCH_SIZE } = require('../src/services/orderExpiryService');
test('Drains every batch, counts only committed winners and is repeatable', async () => {
  const repository = { findExpiredOrderIds: jest.fn().mockResolvedValueOnce(['a', 'b']).mockResolvedValueOnce(['c'])
    .mockResolvedValue([]), expireOrder: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0).mockResolvedValueOnce(1) };
  const service = createOrderExpiryService(repository);
  expect(await service.cleanupExpired()).toBe(2);
  expect(repository.findExpiredOrderIds).toHaveBeenCalledWith(BATCH_SIZE);
  expect(repository.expireOrder.mock.calls).toEqual([['a'], ['b'], ['c']]);
  expect(await service.cleanupExpired()).toBe(0);
});
test('Empty scan does not mutate any order', async () => {
  const repository = { findExpiredOrderIds: jest.fn().mockResolvedValue([]), expireOrder: jest.fn() };
  expect(await createOrderExpiryService(repository).cleanupExpired()).toBe(0);
  expect(repository.expireOrder).not.toHaveBeenCalled();
});
test('Database failure propagates to the scheduler for retry rather than reporting success', async () => {
  const repository = { findExpiredOrderIds: jest.fn().mockResolvedValue(['a']),
    expireOrder: jest.fn().mockRejectedValue(new Error('database unavailable')) };
  await expect(createOrderExpiryService(repository).cleanupExpired()).rejects.toThrow('database unavailable');
});
