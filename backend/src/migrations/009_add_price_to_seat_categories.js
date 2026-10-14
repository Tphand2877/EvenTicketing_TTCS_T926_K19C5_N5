/**
 * S-15 / T-34 - Cột giá trên seat_categories và lưu giá trên seat_holds.
 *
 * - seat_categories.price: số nguyên đơn vị đồng (>= 0), nullable (khi mới nạp sơ đồ ghế chưa đặt giá).
 * - seat_holds.price: lưu giá vé tại thời điểm giữ chỗ/đơn hàng đang chờ (AC3: đổi giá không ảnh hưởng đơn cũ).
 */
exports.up = async (knex) => {
  await knex.schema.alterTable('seat_categories', (table) => {
    table.integer('price').nullable();
    table.check('price >= 0', [], 'seat_categories_price_non_negative');
  });

  await knex.schema.alterTable('seat_holds', (table) => {
    table.integer('price').nullable();
    table.check('price >= 0', [], 'seat_holds_price_non_negative');
  });
};

exports.down = async (knex) => {
  await knex.raw('ALTER TABLE seat_holds DROP CONSTRAINT IF EXISTS seat_holds_price_non_negative');
  await knex.schema.alterTable('seat_holds', (table) => {
    table.dropColumn('price');
  });

  await knex.raw('ALTER TABLE seat_categories DROP CONSTRAINT IF EXISTS seat_categories_price_non_negative');
  await knex.schema.alterTable('seat_categories', (table) => {
    table.dropColumn('price');
  });
};
