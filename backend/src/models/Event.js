const db = require('../config/database');

const TABLE = 'events';

/**
 * Query cơ sở: event + tên organizer + giá thấp nhất + suất diễn sắp tới gần nhất
 * publicOnly: chỉ tính suất người mua thấy được (bỏ suất nháp - S-07)
 */
const baseQuery = ({ publicOnly = false } = {}) =>
  db(TABLE)
    .leftJoin('users', 'events.organizer_id', 'users.id')
    .leftJoin('showtimes', function () {
      this.on('showtimes.event_id', '=', 'events.id');
      if (publicOnly) this.andOnVal('showtimes.status', '<>', 'draft');
    })
    .groupBy('events.id', 'users.full_name')
    .select(
      'events.*',
      'users.full_name as organizer_name',
      db.raw('MIN(showtimes.price) AS min_price'),
      db.raw('MIN(showtimes.starts_at) AS next_starts_at'),
      db.raw('COUNT(showtimes.id)::int AS showtime_count')
    );

const applyFilters = (query, { search, category }) => {
  if (search) query.whereILike('events.title', `%${search}%`);
  if (category) query.where('events.category', category);
  return query;
};

const Event = {
  /**
   * SCRUM-80: Danh sách event đã publish cho buyer (có tìm kiếm, lọc, phân trang)
   */
  listPublished: async ({ search, category, limit, offset }) => {
    const rowsQuery = applyFilters(
      baseQuery({ publicOnly: true }).where('events.status', 'published'),
      { search, category }
    )
      .orderByRaw('MIN(showtimes.starts_at) ASC NULLS LAST')
      .orderBy('events.id', 'desc')
      .limit(limit)
      .offset(offset);

    const countQuery = applyFilters(
      db(TABLE).where('events.status', 'published'),
      { search, category }
    ).count({ total: '*' }).first();

    const [rows, countRow] = await Promise.all([rowsQuery, countQuery]);
    return { rows, total: Number(countRow?.total || 0) };
  },

  /**
   * Danh sách event của một organizer (gồm cả draft)
   */
  listByOrganizer: (organizerId) =>
    baseQuery()
      .where('events.organizer_id', organizerId)
      .orderBy('events.created_at', 'desc'),

  /**
   * Toàn bộ event (dành cho admin)
   */
  listAll: () => baseQuery().orderBy('events.created_at', 'desc'),

  findById: (id) => baseQuery().where('events.id', id).first(),

  /** Chi tiết công khai: thống kê chỉ tính suất không ở trạng thái nháp (S-07) */
  findPublicById: (id) => baseQuery({ publicOnly: true }).where('events.id', id).first(),

  create: (data) => db(TABLE).insert(data).returning('*'),

  updateById: (id, data) =>
    db(TABLE).where({ id }).update({ ...data, updated_at: db.fn.now() }).returning('*'),

  deleteById: (id) => db(TABLE).where({ id }).del(),
};

module.exports = Event;
