const db = require('../config/database');

const TABLE = 'showtimes';

const Showtime = {
  listByEvent: (eventId) =>
    db(TABLE).where({ event_id: eventId }).orderBy('starts_at', 'asc'),

  /** Suất người mua thấy được: đang bán hoặc đã đóng bán, không gồm nháp (S-07) */
  listVisibleByEvent: (eventId) =>
    db(TABLE).where({ event_id: eventId }).whereNot('status', 'draft').orderBy('starts_at', 'asc'),

  /** Cho organizer/admin: kèm số ghế, số hạng và khoảng giá của sơ đồ (S-05, S-07, S-15) */
  listByEventWithSeatMap: (eventId) =>
    db(TABLE)
      .where({ 'showtimes.event_id': eventId })
      .select(
        'showtimes.*',
        db.raw('(SELECT COUNT(*)::int FROM seats WHERE seats.showtime_id = showtimes.id) AS seat_count'),
        db.raw('(SELECT COUNT(*)::int FROM seat_categories c WHERE c.showtime_id = showtimes.id) AS category_count'),
        db.raw('(SELECT MIN((to_jsonb(c)->>\'price\')::numeric) FROM seat_categories c WHERE c.showtime_id = showtimes.id) AS min_price'),
        db.raw('(SELECT MAX((to_jsonb(c)->>\'price\')::numeric) FROM seat_categories c WHERE c.showtime_id = showtimes.id) AS max_price'),
        db.raw('(SELECT COUNT(*)::int FROM seat_categories c WHERE c.showtime_id = showtimes.id AND (to_jsonb(c)->>\'price\') IS NULL) AS unpriced_category_count')
      )
      .orderBy('showtimes.starts_at', 'asc'),

  findById: (id) => db(TABLE).where({ id }).first(),

  create: (data) => db(TABLE).insert(data).returning('*'),

  updateById: (id, data) =>
    db(TABLE).where({ id }).update({ ...data, updated_at: db.fn.now() }).returning('*'),

  deleteById: (id) => db(TABLE).where({ id }).del(),
};

module.exports = Showtime;
