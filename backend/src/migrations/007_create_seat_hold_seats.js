/**
 * SCRUM-170 / T-22: attach concrete seats to durable hold groups.
 *
 * `seat_holds` remains the shared session row (user, showtime and UTC expiry).
 * This table maps each seat in that session without duplicating its deadline.
 * `seat_id` is validated against the T-11 inventory inside the hold transaction;
 * T-11 owns the inventory schema and is not present in every deployment yet.
 */
exports.up = async (knex) => {
  await knex.schema.createTable('seat_hold_seats', (table) => {
    table.integer('showtime_id').notNullable()
      .references('id').inTable('showtimes').onDelete('CASCADE');
    table.integer('seat_id').notNullable();
    table.uuid('hold_id').notNullable()
      .references('id').inTable('seat_holds').onDelete('CASCADE');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // A seat can have only one retained allocation for a showtime. Expired or
    // cancelled mappings are removed transactionally before the seat is reused.
    table.primary(['showtime_id', 'seat_id']);
    table.index(['hold_id']);
  });

  // T-19 reads this allow-listed view. It intentionally excludes user/order data.
  await knex.raw(`
    CREATE VIEW public_seat_holds AS
    SELECT allocations.showtime_id, allocations.seat_id, holds.status::text AS status, holds.expires_at
    FROM seat_hold_seats AS allocations
    JOIN seat_holds AS holds ON holds.id = allocations.hold_id
  `);
};

exports.down = async (knex) => {
  await knex.raw('DROP VIEW IF EXISTS public_seat_holds');
  await knex.schema.dropTableIfExists('seat_hold_seats');
};
