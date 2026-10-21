const db = require('../config/database');

const createSeatHoldRepository = (database) => {
  const clock = (now) => now === undefined ? database.raw('clock_timestamp()') : new Date(now);
  const currentTime = async (transaction, now) => {
    if (now !== undefined) return new Date(now);
    const { rows } = await transaction.raw('SELECT clock_timestamp() AS now');
    return rows[0].now;
  };
  return {
    withShowtimeLock: (showtimeId, operation) => database.transaction(async (transaction) => {
      const showtime = await transaction('showtimes').where({ id: showtimeId }).forUpdate().first();
      return operation(transaction, showtime);
    }),
    currentTime,
    findById: (id, transaction = database) => transaction('seat_holds').where({ id }).first(),
    findActiveUserHold: (transaction, showtimeId, userId) => transaction('seat_holds')
      .where({ showtime_id: showtimeId, user_id: userId, status: 'active' }).first(),
    hasSeatSpecificHolds: (showtimeId, transaction = database) => transaction('seat_hold_seats')
      .where({ showtime_id: showtimeId }).first().then(Boolean),
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
    async cancelActive(transaction, id, now) {
      const changed = await transaction('seat_holds')
        .where({ id, status: 'active' }).whereNull('order_id')
        .update({ status: 'cancelled', cancelled_at: now });
      if (changed > 0) await transaction('seat_hold_seats').where({ hold_id: id }).del();
      return changed;
    },
    // Cancel and release concrete seats atomically; repeat/parallel runs only
    // affect rows that are still active and expired.
    cancelExpired: (now) => database.transaction(async (transaction) => {
      const asOf = await currentTime(transaction, now);
      const expired = await transaction('seat_holds')
        .select('id')
        .where({ status: 'active' })
        .whereNull('order_id')
        .andWhere('expires_at', '<=', asOf)
        .forUpdate();
      const ids = expired.map((hold) => hold.id);
      if (ids.length === 0) return 0;

      const changed = await transaction('seat_holds').whereIn('id', ids)
        .where({ status: 'active' }).whereNull('order_id')
        .update({ status: 'cancelled', cancelled_at: asOf });
      if (changed > 0) await transaction('seat_hold_seats').whereIn('hold_id', ids).del();
      return changed;
    }),
  };
};
module.exports = { createSeatHoldRepository, ...createSeatHoldRepository(db) };
