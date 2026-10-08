/** Unit/API fixture only. PostgreSQL integration tests verify real locking. */
const createMemoryRepository = (showtimes) => {
  const rows = new Map();
  const locks = new Map();
  return {
    rows,
    reset: () => { rows.clear(); locks.clear(); },
    withShowtimeLock: async (id, fn) => {
      const prev = locks.get(id) || Promise.resolve();
      let release;
      const current = new Promise((resolve) => { release = resolve; });
      locks.set(id, prev.then(() => current));
      await prev;
      try {
        return await fn(null, showtimes.find((s) => s.id === id));
      } finally {
        release();
      }
    },
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
