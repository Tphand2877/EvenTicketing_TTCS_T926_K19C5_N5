/** S-31: admission ledger only. S-25 owns ticket issuance and its canonical ID. */
exports.up = async (knex) => {
  await knex.schema.createTable('ticket_checkins', (table) => {
    // A global canonical ticket ID, never the QR text or a signature hash.
    table.string('ticket_id', 200).primary();
    table.integer('showtime_id').notNullable()
      .references('id').inTable('showtimes').onDelete('RESTRICT');
    table.string('gate', 100).notNullable();
    table.timestamp('checked_in_at', { useTz: true }).notNullable().defaultTo(knex.raw('clock_timestamp()'));
    table.integer('staff_user_id').notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    table.string('staff_name', 255).notNullable();
    table.index(['showtime_id', 'checked_in_at']);
    table.check("length(btrim(ticket_id)) > 0 AND length(btrim(gate)) > 0");
  });
  await knex.schema.createTable('ticket_checkin_overrides', (table) => {
    table.uuid('id').primary();
    table.string('ticket_id', 200).notNullable()
      .references('ticket_id').inTable('ticket_checkins').onDelete('RESTRICT');
    table.uuid('request_id').notNullable();
    table.string('gate', 100).notNullable();
    table.timestamp('checked_in_at', { useTz: true }).notNullable().defaultTo(knex.raw('clock_timestamp()'));
    table.integer('staff_user_id').notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    table.string('staff_name', 255).notNullable();
    table.string('reason', 500).notNullable();
    table.unique(['ticket_id', 'request_id']);
    table.index(['ticket_id', 'checked_in_at']);
    table.check("length(btrim(reason)) > 0 AND length(btrim(gate)) > 0 AND length(btrim(staff_name)) > 0");
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('ticket_checkin_overrides');
  await knex.schema.dropTableIfExists('ticket_checkins');
};
