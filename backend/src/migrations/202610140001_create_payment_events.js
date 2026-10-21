/** S-20 / T-45: durable gateway receipts, owned by T-45. */
exports.up = async (knex) => {
  await knex.schema.createTable('payment_events', (table) => {
    table.bigIncrements('id').primary();
    table.string('transaction_id', 128).notNullable().unique();
    // Keep an opaque reference so reconciliation can retain unknown-order callbacks.
    table.string('order_id', 128).notNullable();
    // Text preserves the original JSON, including whitespace/key order, for reconciliation.
    table.text('raw_payload').notNullable();
    table.timestamp('received_at', { useTz: true }).notNullable().defaultTo(knex.raw('clock_timestamp()'));
    table.timestamp('processed_at', { useTz: true }).nullable();
    table.string('outcome', 20).nullable();
    table.string('review_reason', 40).nullable();
    table.index(['order_id', 'received_at']);
    table.check("length(transaction_id) > 0 AND length(order_id) > 0");
    table.check("outcome IS NULL OR outcome IN ('processed', 'needs_review', 'refund_review')");
    table.check('(outcome IS NULL) = (processed_at IS NULL)');
  });
};
exports.down = (knex) => knex.schema.dropTableIfExists('payment_events');
