const db = require('../config/database');

const createPaymentEventRepository = (database = db) => ({
  async processOnce({ transactionId, orderId, rawPayload }, process) {
    return database.transaction(async (transaction) => {
      // The unique index waits for a concurrent owner to commit or roll back.
      // DO NOTHING handles only this key's duplicates, without aborting the transaction.
      const [event] = await transaction('payment_events').insert({
        transaction_id: transactionId, order_id: orderId, raw_payload: rawPayload,
      }).onConflict('transaction_id').ignore().returning('id');
      if (!event) return { duplicate: true };

      const result = await process(transaction, event.id);
      if (!['processed', 'needs_review', 'refund_review'].includes(result?.outcome)) {
        throw new Error('Payment processor returned an invalid outcome.');
      }
      await transaction('payment_events').where({ id: event.id }).update({
        outcome: result.outcome,
        review_reason: result.reviewReason || null,
        processed_at: transaction.raw('clock_timestamp()'),
      });
      // Resolves only after commit. A processing/commit failure rolls back the claim too.
      return { duplicate: false, outcome: result.outcome };
    });
  }
});
module.exports = { createPaymentEventRepository };
