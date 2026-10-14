/**
 * T-41 payment URL recovery and indeterminate claim state.
 * Kept separate from T-36's order foundation migration.
 */
exports.up = async (knex) => {
  if (!(await knex.schema.hasTable('orders'))) {
    throw new Error('T-41 payment recovery requires the orders table from T-36.');
  }

  const hasPaymentUrl = await knex.schema.hasColumn('orders', 'payment_url');
  const hasRequestStatus = await knex.schema.hasColumn('orders', 'payment_request_status');
  const hasRequestStartedAt = await knex.schema.hasColumn('orders', 'payment_request_started_at');
  const hasErrorCode = await knex.schema.hasColumn('orders', 'payment_error_code');

  if (!hasPaymentUrl || !hasRequestStatus || !hasRequestStartedAt || !hasErrorCode) {
    await knex.schema.alterTable('orders', (table) => {
      if (!hasPaymentUrl) table.text('payment_url').nullable();
      if (!hasRequestStatus) table.string('payment_request_status', 20).nullable();
      if (!hasRequestStartedAt) table.timestamp('payment_request_started_at', { useTz: true }).nullable();
      if (!hasErrorCode) table.string('payment_error_code', 64).nullable();
    });
  }

  await knex.raw(`
    UPDATE orders
    SET payment_request_status = CASE
          WHEN payment_url IS NOT NULL THEN 'ready'
          ELSE 'indeterminate'
        END,
        payment_request_started_at = COALESCE(payment_request_started_at, updated_at, clock_timestamp())
    WHERE gateway_request_id IS NOT NULL
      AND payment_request_status IS NULL
  `);

  await knex.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'orders'::regclass AND conname = 'orders_payment_request_status_check'
      ) THEN
        ALTER TABLE orders ADD CONSTRAINT orders_payment_request_status_check
          CHECK (payment_request_status IS NULL OR payment_request_status IN ('processing', 'ready', 'indeterminate'));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'orders'::regclass AND conname = 'orders_payment_request_claim_check'
      ) THEN
        ALTER TABLE orders ADD CONSTRAINT orders_payment_request_claim_check
          CHECK (payment_request_status IS NULL OR gateway_request_id IS NOT NULL);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'orders'::regclass AND conname = 'orders_payment_url_state_check'
      ) THEN
        ALTER TABLE orders ADD CONSTRAINT orders_payment_url_state_check
          CHECK ((payment_url IS NULL) = (payment_request_status IS DISTINCT FROM 'ready'));
      END IF;
    END $$;
  `);
};

exports.down = async (knex) => {
  if (!(await knex.schema.hasTable('orders'))) return;

  await knex.raw(`
    ALTER TABLE orders
      DROP CONSTRAINT IF EXISTS orders_payment_request_status_check,
      DROP CONSTRAINT IF EXISTS orders_payment_request_claim_check,
      DROP CONSTRAINT IF EXISTS orders_payment_url_state_check
  `);

  const hasPaymentUrl = await knex.schema.hasColumn('orders', 'payment_url');
  const hasRequestStatus = await knex.schema.hasColumn('orders', 'payment_request_status');
  const hasRequestStartedAt = await knex.schema.hasColumn('orders', 'payment_request_started_at');
  const hasErrorCode = await knex.schema.hasColumn('orders', 'payment_error_code');
  if (hasPaymentUrl || hasRequestStatus || hasRequestStartedAt || hasErrorCode) {
    await knex.schema.alterTable('orders', (table) => {
      if (hasPaymentUrl) table.dropColumn('payment_url');
      if (hasRequestStatus) table.dropColumn('payment_request_status');
      if (hasRequestStartedAt) table.dropColumn('payment_request_started_at');
      if (hasErrorCode) table.dropColumn('payment_error_code');
    });
  }
};
