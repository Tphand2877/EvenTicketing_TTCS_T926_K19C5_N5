/**
 * S-25 / S-26: mỗi ghế của đơn đã thanh toán là một vé điện tử.
 * id của vé là mã chuẩn (canonical ticket ID) mà QR có chữ ký trỏ tới và S-31 dùng để chống vào lại.
 */
exports.up = async (knex) => {
  await knex.schema.createTable('tickets', (table) => {
    table.uuid('id').primary();
    table.uuid('order_id').notNullable()
      .references('id').inTable('orders').onDelete('RESTRICT');
    // Một dòng order_items (một ghế của một đơn) chỉ sinh đúng một vé, kể cả khi webhook gửi lại
    table.integer('order_item_id').notNullable().unique()
      .references('id').inTable('order_items').onDelete('RESTRICT');
    table.integer('seat_id').notNullable()
      .references('id').inTable('seats').onDelete('RESTRICT');
    table.integer('showtime_id').notNullable()
      .references('id').inTable('showtimes').onDelete('RESTRICT');
    table.integer('user_id').notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    table.string('status', 20).notNullable().defaultTo('valid');
    table.timestamp('issued_at', { useTz: true }).notNullable().defaultTo(knex.raw('clock_timestamp()'));
    table.index(['user_id', 'issued_at']);
    table.index(['order_id']);
    table.index(['showtime_id']);
    table.check("status IN ('valid', 'void')");
  });

  // Đơn đã thanh toán trước khi có bảng vé vẫn nhận vé
  await knex.raw(`
    INSERT INTO tickets (id, order_id, order_item_id, seat_id, showtime_id, user_id)
    SELECT gen_random_uuid(), ord.id, item.id, item.seat_id, seat.showtime_id, ord.user_id
    FROM order_items item
    JOIN orders ord ON ord.id = item.order_id
    JOIN seats seat ON seat.id = item.seat_id
    WHERE ord.status = 'paid' AND item.released_at IS NULL
    ON CONFLICT (order_item_id) DO NOTHING
  `);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('tickets');
};
