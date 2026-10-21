const { createOrderExpiryRepository } = require('../src/models/OrderExpiry');
test('T-52 never writes when T-42 locked a paid/nonpending/missing order', async () => {
  for (const order of [null, { status: 'paid' }, { status: 'needs_review' }]) {
    const transaction = jest.fn();
    const locks = { withLockedOrder: ({ operation }) => operation({ transaction, order }) };
    expect(await createOrderExpiryRepository({}, locks).expireOrder('order-1')).toBe(0);
    expect(transaction).not.toHaveBeenCalled();
  }
});
test('T-52 uses the T-42 transaction for conditional expiry, allocation release and hold deletion', async () => {
  const orders = { where: jest.fn().mockReturnThis(), update: jest.fn().mockReturnThis(), returning: jest.fn().mockResolvedValue([{ id: 'order-1' }]) };
  const items = { where: jest.fn().mockReturnThis(), whereNull: jest.fn().mockReturnThis(), update: jest.fn().mockResolvedValue(1) };
  const holds = { where: jest.fn().mockReturnThis(), del: jest.fn().mockResolvedValue(1) };
  const transaction = jest.fn((table) => ({ orders, order_items: items, seat_holds: holds })[table]);
  transaction.raw = jest.fn(() => 'database-clock');
  const locks = { withLockedOrder: jest.fn(({ operation }) => operation({ transaction, order: { status: 'pending' } })) };
  expect(await createOrderExpiryRepository({}, locks).expireOrder('order-1')).toBe(1);
  expect(locks.withLockedOrder).toHaveBeenCalledWith({ orderId: 'order-1', operation: expect.any(Function) });
  expect(orders.where).toHaveBeenCalledWith({ id: 'order-1', status: 'pending' });
  expect(orders.where).toHaveBeenCalledWith('expires_at', '<=', 'database-clock');
  expect(items.where).toHaveBeenCalledWith({ order_id: 'order-1' });
  expect(items.whereNull).toHaveBeenCalledWith('released_at');
  expect(holds.where).toHaveBeenCalledWith({ order_id: 'order-1', status: 'pending_payment' });
});
test('If deadline/status changed while waiting, T-52 does not release allocations or holds', async () => {
  const orders = { where: jest.fn().mockReturnThis(), update: jest.fn().mockReturnThis(), returning: jest.fn().mockResolvedValue([]) };
  const transaction = jest.fn(() => orders);
  transaction.raw = jest.fn(() => 'database-clock');
  const locks = { withLockedOrder: ({ operation }) => operation({ transaction, order: { status: 'pending' } }) };
  expect(await createOrderExpiryRepository({}, locks).expireOrder('order-1')).toBe(0);
  expect(transaction.mock.calls).toEqual([['orders']]);
});
