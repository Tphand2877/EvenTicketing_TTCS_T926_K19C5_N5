/**
 * T-42 payment result state. Kept separate from the T-36/T-41 migrations.
 */
exports.up = async (knex) => {
  for (const table of ['orders', 'order_items', 'seat_holds', 'seats']) {
    if (!(await knex.schema.hasTable(table))) {
      throw new Error(`T-42 payment results require the ${table} schema from earlier tasks.`);
    }
  }

  const requiredColumns = {
    orders: ['id', 'user_id', 'status', 'total_amount', 'currency', 'expires_at', 'gateway_provider',
      'gateway_request_id', 'payment_error_code', 'updated_at'],
    order_items: ['order_id', 'seat_id', 'released_at'],
    seat_holds: ['id', 'order_id', 'user_id', 'showtime_id', 'quantity', 'status', 'expires_at'],
    seats: ['id', 'showtime_id'],
  };
  for (const [table, columns] of Object.entries(requiredColumns)) {
    for (const column of columns) {
      if (!(await knex.schema.hasColumn(table, column))) {
        throw new Error(`T-42 payment results require ${table}.${column} from earlier tasks.`);
      }
    }
  }

  const hasGatewayTransactionId = await knex.schema.hasColumn('orders', 'gateway_transaction_id');
  const hasGatewayResultStatus = await knex.schema.hasColumn('orders', 'gateway_result_status');
  if (!hasGatewayTransactionId || !hasGatewayResultStatus) {
    await knex.schema.alterTable('orders', (table) => {
      if (!hasGatewayTransactionId) table.string('gateway_transaction_id', 128).nullable();
      if (!hasGatewayResultStatus) table.string('gateway_result_status', 20).nullable();
    });
  }

  await knex.raw(`
    DO $$
    DECLARE constraint_row record;
    BEGIN
      FOR constraint_row IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'orders'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%status%'
          AND pg_get_constraintdef(oid) ILIKE '%pending%'
          AND pg_get_constraintdef(oid) ILIKE '%paid%'
          AND pg_get_constraintdef(oid) ILIKE '%cancelled%'
          AND pg_get_constraintdef(oid) ILIKE '%expired%'
      LOOP
        EXECUTE format('ALTER TABLE orders DROP CONSTRAINT %I', constraint_row.conname);
      END LOOP;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'orders'::regclass AND conname = 'orders_status_t42_check'
      ) THEN
        ALTER TABLE orders ADD CONSTRAINT orders_status_t42_check
          CHECK (status IN ('pending', 'paid', 'cancelled', 'expired', 'needs_review'));
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'orders'::regclass AND conname = 'orders_gateway_result_status_check'
      ) THEN
        ALTER TABLE orders ADD CONSTRAINT orders_gateway_result_status_check
          CHECK (gateway_result_status IS NULL OR gateway_result_status IN ('succeeded', 'failed', 'pending'));
      END IF;
    END $$;
  `);
};

exports.down = async (knex) => {
  if (!(await knex.schema.hasTable('orders'))) return;

  const rows = await knex('orders')
    .where('status', 'needs_review')
    .orWhereNotNull('gateway_transaction_id')
    .orWhereNotNull('gateway_result_status')
    .count({ count: '*' });
  if (Number(rows[0].count) > 0) {
    throw new Error('Cannot roll back T-42 result state while payment results are stored.');
  }

  await knex.raw(`
    ALTER TABLE orders
      DROP CONSTRAINT IF EXISTS orders_status_t42_check,
      DROP CONSTRAINT IF EXISTS orders_gateway_result_status_check;
    ALTER TABLE orders ADD CONSTRAINT orders_status_t41_check
      CHECK (status IN ('pending', 'paid', 'cancelled', 'expired'));
  `);

  const hasGatewayTransactionId = await knex.schema.hasColumn('orders', 'gateway_transaction_id');
  const hasGatewayResultStatus = await knex.schema.hasColumn('orders', 'gateway_result_status');
  if (hasGatewayTransactionId || hasGatewayResultStatus) {
    await knex.schema.alterTable('orders', (table) => {
      if (hasGatewayTransactionId) table.dropColumn('gateway_transaction_id');
      if (hasGatewayResultStatus) table.dropColumn('gateway_result_status');
    });
  }
};
