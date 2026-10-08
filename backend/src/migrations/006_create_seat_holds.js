/** SCRUM-177: durable holds; status transitions preserve cancellation history. */
exports.up = async (knex) => {
  await knex.schema.createTable('seat_holds', (table) => {
    table.uuid('id').primary();
    table.integer('showtime_id').notNullable().references('id').inTable('showtimes').onDelete('CASCADE');
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('quantity').notNullable();
    table.string('status', 20).notNullable().defaultTo('active');
    table.string('order_id', 128).nullable().unique();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('cancelled_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['showtime_id', 'status', 'expires_at']);
    table.check('quantity > 0');
    table.check("status IN ('active', 'cancelled', 'pending_payment', 'confirmed')");
    table.check("(status IN ('active', 'cancelled') AND order_id IS NULL) OR (status IN ('pending_payment', 'confirmed') AND order_id IS NOT NULL)");
  });
  await knex.raw("CREATE UNIQUE INDEX seat_holds_one_active_per_user ON seat_holds (showtime_id, user_id) WHERE status = 'active'");
  await knex.raw("CREATE INDEX seat_holds_expiry ON seat_holds (expires_at) WHERE status = 'active' AND order_id IS NULL");
};
exports.down = (knex) => knex.schema.dropTableIfExists('seat_holds');
