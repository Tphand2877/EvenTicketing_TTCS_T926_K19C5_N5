/**
 * S-07 / T-15 - Luật chuyển trạng thái mở bán của suất diễn.
 *
 *   draft  --open-->  on_sale   (AC1; cần sơ đồ ghế - AC2)
 *   on_sale --close--> closed   (AC3)
 *   closed --open-->  on_sale   (AC4: đổi qua lại được)
 *
 * Khoá dòng showtimes FOR UPDATE - cùng khoá với API giữ chỗ và nạp sơ đồ ghế -
 * nên đóng bán không thể chen giữa lúc một lượt giữ chỗ đang kiểm tra trạng thái.
 * Mỗi lần đổi ghi một dòng showtime_status_logs kèm người thao tác (NFR).
 */
const db = require('../config/database');

const ACTIONS = {
  open: { from: ['draft', 'closed'], to: 'on_sale' },
  close: { from: ['on_sale'], to: 'closed' },
};

const STATUS_LABELS = { draft: 'nháp', on_sale: 'đang bán', closed: 'đã đóng bán' };

class ShowtimeSaleError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const createShowtimeSaleService = (database = db) => ({
  /**
   * @param {{ showtimeId: number, action: 'open' | 'close', userId: number }} input
   * @returns {Promise<{ showtime: object, log: object }>}
   */
  changeStatus({ showtimeId, action, userId }) {
    const rule = ACTIONS[action];
    if (!rule) throw new ShowtimeSaleError('INVALID_ACTION', 'Hành động không hợp lệ.');

    return database.transaction(async (trx) => {
      const showtime = await trx('showtimes').where({ id: showtimeId }).forUpdate().first();
      if (!showtime) throw new ShowtimeSaleError('SHOWTIME_NOT_FOUND', 'Không tìm thấy suất diễn.');

      if (showtime.status === rule.to) {
        throw new ShowtimeSaleError('ALREADY_IN_STATUS', `Suất diễn đã ở trạng thái ${STATUS_LABELS[rule.to]}.`);
      }
      if (!rule.from.includes(showtime.status)) {
        throw new ShowtimeSaleError('INVALID_TRANSITION',
          `Không thể ${action === 'open' ? 'mở bán' : 'đóng bán'} suất diễn đang ở trạng thái ${STATUS_LABELS[showtime.status]}.`);
      }

      if (action === 'open') {
        const seat = await trx('seats').where({ showtime_id: showtimeId }).first('id');
        if (!seat) {
          throw new ShowtimeSaleError('NO_SEAT_MAP',
            'Suất diễn chưa có sơ đồ ghế. Hãy nạp sơ đồ ghế trước khi mở bán.');
        }
        const event = await trx('events').where({ id: showtime.event_id }).first('status');
        if (!event || event.status !== 'published') {
          throw new ShowtimeSaleError('EVENT_NOT_PUBLISHED',
            'Sự kiện chưa được công khai. Hãy công khai sự kiện trước khi mở bán.');
        }
        const { rows } = await trx.raw('SELECT ?::timestamptz <= clock_timestamp() AS started', [showtime.starts_at]);
        if (rows[0].started) {
          throw new ShowtimeSaleError('SHOWTIME_STARTED', 'Suất diễn đã bắt đầu, không thể mở bán.');
        }
      }

      const [updated] = await trx('showtimes').where({ id: showtimeId })
        .update({ status: rule.to, updated_at: trx.fn.now() }).returning('*');
      const [log] = await trx('showtime_status_logs').insert({
        showtime_id: showtimeId,
        from_status: showtime.status,
        to_status: rule.to,
        changed_by: userId,
        // Thời điểm thật lúc đổi (sau khi có khoá), không phải lúc transaction bắt đầu
        changed_at: trx.raw('clock_timestamp()'),
      }).returning('*');

      return { showtime: updated, log };
    });
  },

  /**
   * Nhật ký đổi trạng thái, mới nhất trước (kèm tên người thao tác cho organizer/admin xem).
   */
  listStatusLog(showtimeId) {
    return database('showtime_status_logs as l')
      .leftJoin('users as u', 'u.id', 'l.changed_by')
      .where('l.showtime_id', showtimeId)
      .orderBy([{ column: 'l.changed_at', order: 'desc' }, { column: 'l.id', order: 'desc' }])
      .select('l.id', 'l.from_status', 'l.to_status', 'l.changed_by', 'u.full_name as changed_by_name', 'l.changed_at');
  },
});

module.exports = { ShowtimeSaleError, STATUS_LABELS, createShowtimeSaleService, ...createShowtimeSaleService() };
