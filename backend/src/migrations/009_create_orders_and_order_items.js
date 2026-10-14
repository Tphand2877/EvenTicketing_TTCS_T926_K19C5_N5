/**
 * S-16 / T-36 foundation consumed by T-41.
 * Prices and category names are snapshots so later catalog edits do not change an order.
 */
exports.up = async (knex) => {
  await knex.schema.createTable('orders', (table) => {
    table.uuid('id').primary();
    table.integer('user_id').notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    table.string('status', 20).notNullable().defaultTo('pending');
    table.integer('total_amount').notNullable();
    table.string('currency', 3).notNullable().defaultTo('VND');
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.string('gateway_provider', 32).nullable();
    table.string('gateway_request_id', 128).nullable().unique();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['user_id', 'status', 'expires_at']);
    table.check("status IN ('pending', 'paid', 'cancelled', 'expired')");
    table.check('total_amount > 0');
    table.check("currency = 'VND'");
  });

  await knex.schema.createTable('order_items', (table) => {
    table.increments('id').primary();
    table.uuid('order_id').notNullable()
      .references('id').inTable('orders').onDelete('CASCADE');
    table.integer('seat_id').notNullable()
      .references('id').inTable('seats').onDelete('RESTRICT');
    table.string('category_name', 100).notNullable();
    table.integer('unit_price').notNullable();
    table.timestamp('released_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['order_id', 'seat_id']);
    table.index(['order_id']);
    table.check('unit_price >= 0');
  });

  // A held or sold seat can belong to only one unreleased order allocation.
  await knex.raw('CREATE UNIQUE INDEX order_items_one_live_order_per_seat ON order_items (seat_id) WHERE released_at IS NULL');
};

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS order_items_one_live_order_per_seat');
  await knex.schema.dropTableIfExists('order_items');
  await knex.schema.dropTableIfExists('orders');
};
