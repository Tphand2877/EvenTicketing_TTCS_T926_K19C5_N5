const db = require('../config/database');
const { createPaymentResultRepository } = require('../repositories/paymentResultRepository');

const createOrderExpiryRepository = (database = db, locks = createPaymentResultRepository(database)) => ({
  findExpiredOrderIds: (limit) => database('orders').where({ status: 'pending' })
    .where('expires_at', '<=', database.raw('clock_timestamp()'))
    .orderBy('expires_at').orderBy('id').limit(limit).pluck('id'),
  expireOrder: (id) => locks.withLockedOrder({ orderId: id, operation: async ({ transaction, order }) => {
    // Reuse T-42's actual order/allocation/hold lock order, rather than another lock implementation.
    if (!order || order.status !== 'pending') return 0;
    const changed = await transaction('orders').where({ id, status: 'pending' })
      .where('expires_at', '<=', transaction.raw('clock_timestamp()'))
      .update({ status: 'expired', updated_at: transaction.raw('clock_timestamp()') }).returning('id');
    if (!changed.length) return 0;
    await transaction('order_items').where({ order_id: id }).whereNull('released_at')
      .update({ released_at: transaction.raw('clock_timestamp()') });
    await transaction('seat_holds').where({ order_id: id, status: 'pending_payment' }).del();
    return 1;
  } }),
});
module.exports = { createOrderExpiryRepository };
