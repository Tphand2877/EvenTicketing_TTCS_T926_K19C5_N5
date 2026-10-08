const db = require('../config/database');

const createSeatHoldRepository = (database) => {
  const clock = (now) => now === undefined ? database.raw('clock_timestamp()') : new Date(now);
  return {
    withShowtimeLock: (showtimeId, operation) => database.transaction(async (transaction) => {
      const showtime = await transaction('showtimes').where({ id: showtimeId }).forUpdate().first();
      return operation(transaction, showtime);
    }),
    async currentTime(transaction, now) {
      if (now !== undefined) return new Date(now);
      const { rows } = await transaction.raw('SELECT clock_timestamp() AS now');
      return rows[0].now;
    },
    findById: (id, transaction = database) => transaction('seat_holds').where({ id }).first(),
    findActiveUserHold: (transaction, showtimeId, userId) => transaction('seat_holds')
      .where({ showtime_id: showtimeId, user_id: userId, status: 'active' }).first(),
    async heldQuantity({ showtimeId, excludeHoldId, now, transaction = database }) {
      const query = transaction('seat_holds').where({ showtime_id: showtimeId })
        .andWhere(function () {
          this.where(function () {
            this.where({ status: 'active' }).andWhere('expires_at', '>', clock(now));
          }).orWhereIn('status', ['pending_payment', 'confirmed']);
        });
      if (excludeHoldId) query.whereNot('id', excludeHoldId);
      const row = await query.sum({ held: 'quantity' }).first();
      return Number(row.held || 0);
    },
    async insert(transaction, data) {
      const [hold] = await transaction('seat_holds').insert(data).returning('*');
      return hold;
    },
    cancelActive: (transaction, id, now) => transaction('seat_holds')
      .where({ id, status: 'active' }).whereNull('order_id')
      .update({ status: 'cancelled', cancelled_at: now }),
    async convertActive(transaction, id, orderId, now) {
      const [hold] = await transaction('seat_holds').where({ id, status: 'active' })
        .whereNull('order_id').andWhere('expires_at', '>', clock(now))
        .update({ status: 'pending_payment', order_id: orderId }).returning('*');
      return hold;
    },
    // One conditional SQL update: repeat/parallel runs do not cancel twice.
    cancelExpired: (now) => database('seat_holds').where({ status: 'active' })
      .whereNull('order_id').andWhere('expires_at', '<=', clock(now))
      .update({ status: 'cancelled', cancelled_at: clock(now) }),
  };
};
module.exports = { createSeatHoldRepository, ...createSeatHoldRepository(db) };
