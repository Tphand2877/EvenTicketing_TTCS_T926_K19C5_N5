/**
 * S-15 / T-34 - Quản lý giá vé cho từng hạng ghế của suất diễn.
 *
 * AC1: Nhập giá cho từng hạng và lưu -> sơ đồ ghế hiện đúng giá.
 * AC2: Chặn mở bán nếu có hạng chưa có giá (xử lý ở showtimeSaleService).
 * AC3: Đơn hàng đang chờ giữ nguyên giá cũ, chỉ đơn tạo sau mới dùng giá mới.
 * AC4 / NFR: Giá lưu bằng số nguyên đơn vị đồng, không dùng số thực, không âm.
 */
const db = require('../config/database');

class SeatCategoryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const createSeatCategoryService = (database = db) => ({
  /**
   * Lấy danh sách hạng ghế kèm số ghế và giá hiện tại của suất diễn.
   * @param {number} showtimeId
   */
  async listCategoriesByShowtime(showtimeId) {
    const categories = await database('seat_categories as c')
      .where('c.showtime_id', showtimeId)
      .select(
        'c.id',
        'c.showtime_id',
        'c.name',
        'c.price',
        database.raw('(SELECT COUNT(*)::int FROM seats s WHERE s.category_id = c.id AND s.showtime_id = c.showtime_id) AS seat_count')
      )
      .orderBy('c.id', 'asc');

    return categories.map((c) => ({
      ...c,
      price: c.price !== null && c.price !== undefined ? Number(c.price) : null,
      seat_count: Number(c.seat_count || 0),
    }));
  },

  /**
   * Cập nhật giá vé cho các hạng ghế của suất diễn trong một giao dịch.
   *
   * @param {{
   *   showtimeId: number,
   *   prices: Array<{ id?: number, name?: string, price: number }>
   * }} input
   */
  async updateCategoryPrices({ showtimeId, prices }) {
    if (!Array.isArray(prices) || prices.length === 0) {
      throw new SeatCategoryError('EMPTY_PRICES', 'Danh sách giá vé không được để trống.');
    }

    return database.transaction(async (trx) => {
      const showtime = await trx('showtimes').where({ id: showtimeId }).forUpdate().first();
      if (!showtime) {
        throw new SeatCategoryError('SHOWTIME_NOT_FOUND', 'Không tìm thấy suất diễn.');
      }

      const existing = await trx('seat_categories').where({ showtime_id: showtimeId });
      if (existing.length === 0) {
        throw new SeatCategoryError('NO_CATEGORIES', 'Suất diễn chưa có hạng ghế nào. Hãy nạp sơ đồ ghế trước.');
      }

      const existingById = new Map(existing.map((c) => [Number(c.id), c]));
      const existingByName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]));

      // Kiểm tra hợp lệ toàn bộ trước khi ghi
      const updates = [];
      for (const item of prices) {
        let matched = null;
        if (item.id !== undefined && item.id !== null) {
          matched = existingById.get(Number(item.id));
        } else if (item.name && typeof item.name === 'string') {
          matched = existingByName.get(item.name.trim().toLowerCase());
        }

        if (!matched) {
          throw new SeatCategoryError(
            'CATEGORY_NOT_FOUND',
            `Hạng ghế ${item.name || item.id} không thuộc suất diễn này.`
          );
        }

        const rawPrice = item.price;
        // AC4 / NFR: Kiểm tra không âm, không phải float, phải là số nguyên
        if (rawPrice === null || rawPrice === undefined || rawPrice === '') {
          throw new SeatCategoryError('INVALID_PRICE', 'Giá vé không được để trống.');
        }

        if (typeof rawPrice === 'string' && rawPrice.includes('.')) {
          throw new SeatCategoryError('INVALID_PRICE', 'Giá lưu bằng số nguyên đơn vị đồng, không dùng số thực.');
        }

        const priceNum = Number(rawPrice);
        if (Number.isNaN(priceNum)) {
          throw new SeatCategoryError('INVALID_PRICE', 'Giá vé phải là số hợp lệ.');
        }

        if (!Number.isInteger(priceNum)) {
          throw new SeatCategoryError('INVALID_PRICE', 'Giá lưu bằng số nguyên đơn vị đồng, không dùng số thực.');
        }

        if (priceNum < 0) {
          throw new SeatCategoryError('INVALID_PRICE', 'Giá vé không được là số âm.');
        }

        updates.push({ id: matched.id, price: priceNum });
      }

      // Cập nhật giá từng hạng ghế (AC3: Không đụng tới đơn hàng / hold đang chờ)
      for (const { id, price } of updates) {
        await trx('seat_categories')
          .where({ id, showtime_id: showtimeId })
          .update({ price, updated_at: trx.fn.now() });
      }

      // Cập nhật updated_at của showtimes
      await trx('showtimes')
        .where({ id: showtimeId })
        .update({ updated_at: trx.fn.now() });

      // Lấy danh sách hạng ghế sau khi cập nhật
      const updated = await trx('seat_categories as c')
        .where('c.showtime_id', showtimeId)
        .select(
          'c.id',
          'c.showtime_id',
          'c.name',
          'c.price',
          trx.raw('(SELECT COUNT(*)::int FROM seats s WHERE s.category_id = c.id AND s.showtime_id = c.showtime_id) AS seat_count')
        )
        .orderBy('c.id', 'asc');

      return updated.map((c) => ({
        ...c,
        price: c.price !== null && c.price !== undefined ? Number(c.price) : null,
        seat_count: Number(c.seat_count || 0),
      }));
    });
  },
});

module.exports = {
  SeatCategoryError,
  createSeatCategoryService,
  ...createSeatCategoryService(),
};
