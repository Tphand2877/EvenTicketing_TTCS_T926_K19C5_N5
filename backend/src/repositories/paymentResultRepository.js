const db = require('../config/database');

class PaymentResultPersistenceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PaymentResultPersistenceError';
    this.code = 'PAYMENT_RESULT_PERSISTENCE_FAILED';
  }
}

const createPaymentResultRepository = (database = db) => ({
  /**
   * Locks the order, its per-seat order allocations, and the linked quantity hold
   * in that order. S-20 can pass its transaction so event deduplication and this
   * business update commit or roll back together.
   */
  async withLockedOrder({ orderId, transaction, operation }) {
    const run = async (trx) => {
      const order = await trx('orders').where({ id: orderId }).forUpdate().first();
      if (!order) return operation({ transaction: trx, order: null, allocations: [], hold: null, databaseNow: null });

      const allocations = await trx('order_items as allocation')
        .join('seats as seat', 'seat.id', 'allocation.seat_id')
        .select({
          id: 'allocation.id',
          seatId: 'allocation.seat_id',
          releasedAt: 'allocation.released_at',
          showtimeId: 'seat.showtime_id',
        })
        .where('allocation.order_id', orderId)
        .orderBy('allocation.seat_id')
        .forUpdate();
      const hold = await trx('seat_holds').where({ order_id: orderId }).forUpdate().first();
      const { rows } = await trx.raw('SELECT clock_timestamp() AS database_now');

      return operation({
        transaction: trx,
        order,
        allocations,
        hold,
        databaseNow: rows[0].database_now,
      });
    };

    return transaction ? run(transaction) : database.transaction(run);
  },

  async markNeedsReview(transaction, { orderId, gatewayTransactionId, errorCode }) {
    const rows = await transaction('orders').where({ id: orderId }).update({
      status: 'needs_review',
      gateway_transaction_id: gatewayTransactionId,
      gateway_result_status: 'succeeded',
      payment_error_code: errorCode,
      updated_at: transaction.raw('clock_timestamp()'),
    }).returning(['id']);

    if (rows.length !== 1) throw new PaymentResultPersistenceError('Could not mark the order for review.');
  },

  async markPaid(transaction, { orderId, gatewayTransactionId }) {
    const rows = await transaction('orders').where({ id: orderId, status: 'pending' }).update({
      status: 'paid',
      gateway_transaction_id: gatewayTransactionId,
      gateway_result_status: 'succeeded',
      payment_error_code: null,
      updated_at: transaction.raw('clock_timestamp()'),
    }).returning(['id']);

    if (rows.length !== 1) throw new PaymentResultPersistenceError('Could not confirm the order payment.');
  },

  async recordGatewayResult(transaction, { orderId, status }) {
    const rows = await transaction('orders').where({ id: orderId, status: 'pending' }).update({
      gateway_result_status: status,
      payment_error_code: status === 'failed' ? 'GATEWAY_PAYMENT_FAILED' : null,
      updated_at: transaction.raw('clock_timestamp()'),
    }).returning(['id']);

    if (rows.length !== 1) throw new PaymentResultPersistenceError('Could not record the gateway payment result.');
  },

  /**
   * S-25: phát một vé cho mỗi ghế chưa nhả của đơn vừa thanh toán, trong cùng transaction với
   * markPaid. order_item_id là unique nên chạy lại cũng không sinh thêm vé.
   */
  async issueTickets(transaction, { orderId }) {
    const { rows } = await transaction.raw(`
      INSERT INTO tickets (id, order_id, order_item_id, seat_id, showtime_id, user_id)
      SELECT gen_random_uuid(), ord.id, item.id, item.seat_id, seat.showtime_id, ord.user_id
      FROM order_items item
      JOIN orders ord ON ord.id = item.order_id
      JOIN seats seat ON seat.id = item.seat_id
      WHERE item.order_id = ? AND item.released_at IS NULL AND ord.status = 'paid'
      ON CONFLICT (order_item_id) DO NOTHING
      RETURNING id
    `, [orderId]);
    return rows.length;
  },

  async deletePaymentHold(transaction, { hold }) {
    const deleted = await transaction('seat_holds')
      .where({
        id: hold.id,
        order_id: hold.order_id,
        user_id: hold.user_id,
        showtime_id: hold.showtime_id,
        status: 'pending_payment',
      })
      .del();

    if (deleted !== 1) throw new PaymentResultPersistenceError('Could not release the order payment hold.');
  },
});

module.exports = {
  PaymentResultPersistenceError,
  createPaymentResultRepository,
  ...createPaymentResultRepository(),
};
