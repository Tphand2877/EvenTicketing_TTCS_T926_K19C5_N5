/**
 * S-15 / T-34 - Cột giá trên seat_categories.
 *
 * - seat_categories.price: số nguyên đơn vị đồng (>= 0), nullable (khi mới nạp sơ đồ ghế chưa đặt giá).
 * - AC3 (đổi giá không ảnh hưởng đơn đang chờ): đơn lưu bản sao giá ở order_items.unit_price
 *   lúc tạo đơn (T-36/T-38), nên đổi giá hạng chỉ áp dụng cho đơn tạo sau.
 */
exports.up = async (knex) => {
  await knex.schema.alterTable('seat_categories', (table) => {
    table.integer('price').nullable();
    table.check('price >= 0', [], 'seat_categories_price_non_negative');
  });
};

exports.down = async (knex) => {
  await knex.raw('ALTER TABLE seat_categories DROP CONSTRAINT IF EXISTS seat_categories_price_non_negative');
  await knex.schema.alterTable('seat_categories', (table) => {
    table.dropColumn('price');
  });
};
