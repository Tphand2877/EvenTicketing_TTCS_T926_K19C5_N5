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
  await knex.schema.alterTable('seat_holds', (table) => {
    table.dropCheck('seat_holds_price_non_negative');
    table.dropColumn('price');
  });

  await knex.schema.alterTable('seat_categories', (table) => {
    table.dropCheck('seat_categories_price_non_negative');
    table.dropColumn('price');
  });
};
