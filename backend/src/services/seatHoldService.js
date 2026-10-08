/** Durable, quantity-based holds for the existing showtime API (SCRUM-176). */
const crypto = require('crypto');
const SeatHold = require('../models/SeatHold');

const DEFAULT_TTL_SECONDS = 600;
const validHoldId = (id) => typeof id === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const getTtlMs = () => {
  const seconds = parseInt(process.env.SEAT_HOLD_TTL_SECONDS, 10);
  return (Number.isInteger(seconds) && seconds > 0 ? seconds : DEFAULT_TTL_SECONDS) * 1000;
};
const toPublicHold = (hold) => ({
  id: hold.id, showtimeId: hold.showtime_id, quantity: hold.quantity,
  expiresAt: new Date(hold.expires_at).toISOString(),
});
class SeatHoldError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const createSeatHoldService = (repository = SeatHold) => ({
  // This read never runs cleanup: expired rows may still be present in storage.
  async getAvailability({ showtimeId, capacity, now }) {
    const held = await repository.heldQuantity({ showtimeId, now });
    return { capacity, held, available: Math.max(capacity - held, 0) };
  },

  async holdSeats({ showtimeId, userId, quantity, now }) {
    return repository.withShowtimeLock(showtimeId, async (transaction, showtime) => {
      if (!showtime) throw new SeatHoldError('SHOWTIME_NOT_FOUND', 'Không tìm thấy suất diễn.');
      // Read the database clock AFTER acquiring the lock, including time spent waiting.
      const asOf = await repository.currentTime(transaction, now);
      const existing = await repository.findActiveUserHold(transaction, showtimeId, userId);
      const held = await repository.heldQuantity({
        showtimeId, excludeHoldId: existing?.id, now: asOf, transaction,
      });
      const available = Math.max(showtime.capacity - held, 0);
      if (quantity > available) {
        throw new SeatHoldError('INSUFFICIENT_SEATS', `Chỉ còn ${available} chỗ trống.`, { available });
      }
      if (existing) await repository.cancelActive(transaction, existing.id, asOf);
      const hold = await repository.insert(transaction, {
        id: crypto.randomUUID(), showtime_id: showtimeId, user_id: userId,
        quantity, status: 'active', expires_at: new Date(asOf.getTime() + getTtlMs()),
      });
      return toPublicHold(hold);
    });
  },

  async releaseHold({ holdId, userId, now }) {
    if (!validHoldId(holdId)) return 'not_found';
    const current = await repository.findById(holdId);
    if (!current) return 'not_found';
    return repository.withShowtimeLock(current.showtime_id, async (transaction) => {
      const hold = await repository.findById(holdId, transaction);
      const asOf = await repository.currentTime(transaction, now);
      if (!hold || hold.status !== 'active' || new Date(hold.expires_at) <= asOf) return 'not_found';
      if (hold.user_id !== userId) return 'forbidden';
      await repository.cancelActive(transaction, hold.id, asOf);
      return 'released';
    });
  },

  cleanupExpired({ now } = {}) {
    return repository.cancelExpired(now);
  },
});
module.exports = {
  DEFAULT_TTL_SECONDS, SeatHoldError, createSeatHoldService, ...createSeatHoldService(),
};
