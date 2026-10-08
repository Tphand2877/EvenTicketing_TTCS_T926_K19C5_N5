/** Unit/API fixture only. PostgreSQL integration tests verify real locking. */
const createMemoryRepository = (showtimes) => {
  const rows = new Map();
  return {
    rows,
    reset: () => rows.clear(),
    withShowtimeLock: async (id, fn) => fn(null, showtimes.find((s) => s.id === id)),
    currentTime: async (_transaction, now) => new Date(now ?? Date.now()),
    findById: async (id) => rows.get(id),
    findActiveUserHold: async (_transaction, showtimeId, userId) => [...rows.values()]
      .find((h) => h.showtime_id === showtimeId && h.user_id === userId && h.status === 'active'),
    heldQuantity: async ({ showtimeId, excludeHoldId, now }) => [...rows.values()]
      .filter((h) => h.showtime_id === showtimeId && h.id !== excludeHoldId)
      .filter((h) => ['pending_payment', 'confirmed'].includes(h.status)
        || (h.status === 'active' && new Date(h.expires_at) > new Date(now ?? Date.now())))
      .reduce((sum, h) => sum + h.quantity, 0),
    insert: async (_transaction, data) => {
      const hold = { order_id: null, cancelled_at: null, ...data };
      rows.set(hold.id, hold);
      return hold;
    },
    cancelActive: async (_transaction, id, now) => {
      const hold = rows.get(id);
      if (hold?.status !== 'active' || hold.order_id) return 0;
      Object.assign(hold, { status: 'cancelled', cancelled_at: now });
      return 1;
    },
    convertActive: async (_transaction, id, orderId, now) => {
      const hold = rows.get(id);
      if (hold?.status !== 'active' || new Date(hold.expires_at) <= new Date(now ?? Date.now())) return undefined;
      Object.assign(hold, { status: 'pending_payment', order_id: orderId });
      return hold;
    },
    cancelExpired: async (now) => {
      let count = 0;
      for (const hold of rows.values()) {
        if (hold.status === 'active' && !hold.order_id && new Date(hold.expires_at) <= new Date(now ?? Date.now())) {
          Object.assign(hold, { status: 'cancelled', cancelled_at: new Date(now ?? Date.now()) });
          count++;
        }
      }
      return count;
    },
  };
};
module.exports = { createMemoryRepository };
