const { createOrderExpiryRepository } = require('../models/OrderExpiry');
const BATCH_SIZE = 100;
const createOrderExpiryService = (repository = createOrderExpiryRepository()) => ({
  async cleanupExpired() {
    let expired = 0;
    // Drain the entire backlog in bounded batches, including the first run after restart.
    while (true) {
      const ids = await repository.findExpiredOrderIds(BATCH_SIZE);
      if (!ids.length) return expired;
      for (const id of ids) expired += await repository.expireOrder(id);
    }
  },
});
module.exports = { BATCH_SIZE, createOrderExpiryService, ...createOrderExpiryService() };
