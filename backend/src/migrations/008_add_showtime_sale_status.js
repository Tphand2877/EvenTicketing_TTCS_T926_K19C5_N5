/**
 * S-07 / T-15 - Trạng thái mở bán của suất diễn + nhật ký đổi trạng thái.
 *
 *   draft    (nháp)       : chưa hiện với người mua
 *   on_sale  (đang bán)   : hiện công khai, người mua giữ chỗ được
 *   closed   (đã đóng bán): hiện nhưng không giữ chỗ mới được; hold/đơn đang chờ vẫn xử lý tới hết hạn
 *
 * Tên enum/giá trị theo hợp đồng mà T-17/T-19 (models/PublicShowtime.js) đang đọc.
 */
exports.up = async (knex) => {
  await knex.raw("CREATE TYPE showtime_sale_status AS ENUM ('draft', 'on_sale', 'closed')");
  await knex.raw("ALTER TABLE showtimes ADD COLUMN status showtime_sale_status NOT NULL DEFAULT 'draft'");
  // Suất có sẵn trước S-07 vốn đã hiển thị và bán được: giữ nguyên hành vi đó.
  // Suất tạo mới từ nay mặc định là nháp.
  await knex('showtimes').update({ status: 'on_sale' });
  await knex.raw('CREATE INDEX showtimes_status_starts_at_id ON showtimes (status, starts_at, id)');

  await knex.schema.createTable('showtime_status_logs', (table) => {
    table.increments('id').primary();
    table.integer('showtime_id').notNullable()
      .references('id').inTable('showtimes').onDelete('CASCADE');
    table.specificType('from_status', 'showtime_sale_status').notNullable();
    table.specificType('to_status', 'showtime_sale_status').notNullable();
    // Chỉ lưu id người thao tác (không lưu email/tên vào nhật ký)
    table.integer('changed_by').nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('changed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['showtime_id', 'changed_at']);
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('showtime_status_logs');
  await knex.raw('DROP INDEX IF EXISTS showtimes_status_starts_at_id');
  await knex.raw('ALTER TABLE showtimes DROP COLUMN IF EXISTS status');
  await knex.raw('DROP TYPE IF EXISTS showtime_sale_status');
};
