/**
 * S-05 / T-11 - Bảng seat_categories (hạng ghế) và seats (ghế) của từng suất diễn.
 *
 * Tên bảng/cột theo hợp đồng đã dùng trong models/PublicShowtime.js (T-19):
 *   seat_categories(id, showtime_id, name)  - giá (price) do S-15 bổ sung sau
 *   seats(id, showtime_id, row_label, seat_number, category_id)
 *
 * Khoá ngoại ghép (category_id, showtime_id) bảo đảm hạng ghế của một ghế
 * luôn thuộc CÙNG suất diễn với ghế đó.
 */
exports.up = async (knex) => {
  await knex.schema.createTable('seat_categories', (table) => {
    table.increments('id').primary();
    table.integer('showtime_id').notNullable()
      .references('id').inTable('showtimes').onDelete('CASCADE');
    table.string('name', 100).notNullable();
    table.timestamps(true, true);
    table.unique(['showtime_id', 'name']);
    // Đích cho khoá ngoại ghép từ seats
    table.unique(['id', 'showtime_id']);
  });

  await knex.schema.createTable('seats', (table) => {
    table.increments('id').primary();
    table.integer('showtime_id').notNullable()
      .references('id').inTable('showtimes').onDelete('CASCADE');
    table.integer('category_id').notNullable();
    table.string('row_label', 10).notNullable();
    table.integer('seat_number').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['showtime_id', 'row_label', 'seat_number']);
    table.index(['category_id']);
    table.foreign(['category_id', 'showtime_id'])
      .references(['id', 'showtime_id']).inTable('seat_categories').onDelete('RESTRICT');
    table.check('seat_number > 0');
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('seats');
  await knex.schema.dropTableIfExists('seat_categories');
};
