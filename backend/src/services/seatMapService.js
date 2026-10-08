/**
 * S-05 / T-12 - Nạp sơ đồ ghế từ JSON vào seats + seat_categories trong MỘT giao dịch.
 *
 *  - AC1: tạo toàn bộ ghế; hạng ghế chưa có được tạo theo tên trong tệp.
 *  - AC2: suất đã có sơ đồ nhưng chưa bán/giữ -> thay toàn bộ sơ đồ cũ.
 *  - AC3: suất đã bán vé hoặc đang có người giữ chỗ -> chặn kèm lý do.
 *  - AC4: lỗi ở bất kỳ ghế nào -> rollback, không lưu ghế nào.
 *
 * Dòng showtimes bị khoá FOR UPDATE, cùng khoá mà seatHoldService dùng khi giữ chỗ,
 * nên việc nạp sơ đồ và việc giữ chỗ không thể chen ngang nhau.
 */
const db = require('../config/database');

const INSERT_CHUNK_SIZE = 1000;

class SeatMapError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Bảng/view của các task khác (vé, giữ chỗ theo ghế) có thể chưa tồn tại.
const relationExists = async (trx, name) => {
  const { rows } = await trx.raw('SELECT to_regclass(?) IS NOT NULL AS present', [name]);
  return rows[0].present;
};

const findBlockingReason = async (trx, showtimeId) => {
  if (await relationExists(trx, 'seat_holds')) {
    const { rows } = await trx.raw(`
      SELECT
        bool_or(status IN ('pending_payment', 'confirmed')) AS sold,
        bool_or(status = 'active' AND expires_at > clock_timestamp()) AS held
      FROM seat_holds WHERE showtime_id = ?`, [showtimeId]);
    if (rows[0].sold) return 'Suất diễn đã có vé được bán hoặc đang chờ thanh toán.';
    if (rows[0].held) return 'Suất diễn đang có người giữ chỗ.';
  }
  if (await relationExists(trx, 'public_sold_seats')) {
    const sold = await trx('public_sold_seats').where({ showtime_id: showtimeId }).first();
    if (sold) return 'Suất diễn đã có vé được bán.';
  }
  if (await relationExists(trx, 'public_seat_holds')) {
    const held = await trx('public_seat_holds').where({ showtime_id: showtimeId })
      .andWhere(function () {
        this.where(function () {
          this.where('status', 'active').andWhere('expires_at', '>', trx.raw('clock_timestamp()'));
        }).orWhereIn('status', ['pending_payment', 'confirmed']);
      })
      .first();
    if (held) return 'Suất diễn đang có ghế được giữ hoặc đã bán.';
  }
  return null;
};

const createSeatMapService = (database = db) => ({
  /**
   * @param {{ showtimeId: number, seats: { row: string, number: number, category: string }[] }} input
   *        seats đã được validate (validateSeatMap): không trùng (row, number).
   * @returns {Promise<{ seatCount: number, replacedSeatCount: number,
   *           categories: { name: string, seatCount: number }[], createdCategories: string[] }>}
   */
  importSeatMap({ showtimeId, seats }) {
    return database.transaction(async (trx) => {
      const showtime = await trx('showtimes').where({ id: showtimeId }).forUpdate().first();
      if (!showtime) throw new SeatMapError('SHOWTIME_NOT_FOUND', 'Không tìm thấy suất diễn.');

      const reason = await findBlockingReason(trx, showtimeId);
      if (reason) throw new SeatMapError('SEAT_MAP_LOCKED', `Không thể thay sơ đồ ghế: ${reason}`);

      // AC2: thay toàn bộ sơ đồ cũ
      const replacedSeatCount = await trx('seats').where({ showtime_id: showtimeId }).del();

      // AC1: tạo các hạng ghế chưa có (giữ nguyên hạng đã có, vd. giá do S-15 đặt)
      const names = [...new Set(seats.map((s) => s.category))];
      const existing = await trx('seat_categories').where({ showtime_id: showtimeId }).select('id', 'name');
      const idByName = new Map(existing.map((c) => [c.name, c.id]));
      const missing = names.filter((name) => !idByName.has(name));
      if (missing.length > 0) {
        const created = await trx('seat_categories')
          .insert(missing.map((name) => ({ showtime_id: showtimeId, name })))
          .returning(['id', 'name']);
        created.forEach((c) => idByName.set(c.name, c.id));
      }

      const rows = seats.map((s) => ({
        showtime_id: showtimeId,
        category_id: idByName.get(s.category),
        row_label: s.row,
        seat_number: s.number,
      }));
      for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
        await trx('seats').insert(rows.slice(i, i + INSERT_CHUNK_SIZE));
      }

      // Sức chứa của suất diễn = số ghế trong sơ đồ, để API giữ chỗ theo số lượng khớp sơ đồ
      await trx('showtimes').where({ id: showtimeId })
        .update({ capacity: rows.length, updated_at: trx.fn.now() });

      const counts = new Map();
      seats.forEach((s) => counts.set(s.category, (counts.get(s.category) || 0) + 1));

      return {
        seatCount: rows.length,
        replacedSeatCount,
        categories: names.map((name) => ({ name, seatCount: counts.get(name) })),
        createdCategories: missing,
      };
    });
  },
});

module.exports = { SeatMapError, createSeatMapService, ...createSeatMapService() };
