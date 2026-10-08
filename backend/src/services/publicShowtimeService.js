const crypto = require('crypto');
const repository = require('../models/PublicShowtime');
const cache = require('./showtimePageCache');

class PublicQueryError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const badCursor = () => new PublicQueryError(400, 'Con trỏ phân trang không hợp lệ.');
const parsePage = ({ limit = '20', cursor } = {}) => {
  if (typeof limit !== 'string' || !/^\d{1,2}$/.test(limit) || Number(limit) < 1 || Number(limit) > 50) {
    throw new PublicQueryError(400, 'Số mục mỗi trang phải từ 1 đến 50.');
  }
  let after;
  if (cursor !== undefined) {
    if (typeof cursor !== 'string' || cursor.length > 200 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw badCursor();
    try {
      const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (value.v !== 1 || !Number.isInteger(value.id) || value.id < 1 || value.id > 2147483647
        || typeof value.startsAt !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value.startsAt)
        || !Number.isFinite(Date.parse(value.startsAt))
        || new Date(value.startsAt).toISOString() !== `${value.startsAt.slice(0, 23)}Z`) throw badCursor();
      after = { startsAt: value.startsAt, id: value.id };
    } catch { throw badCursor(); }
  }
  return { limit: Number(limit), after };
};
const encodeCursor = (row) => Buffer.from(JSON.stringify({ v: 1, startsAt: row.cursor_time, id: row.id })).toString('base64url');
const isoTime = (value) => value instanceof Date ? value.toISOString() : value;
const publicShowtime = (row) => ({
  id: row.id, event_id: row.event_id, title: row.title, description: row.description,
  category: row.category, venue: row.venue, image_url: row.image_url,
  starts_at: isoTime(row.starts_at), ends_at: isoTime(row.ends_at), status: row.status,
  min_price: row.min_price == null ? null : Number(row.min_price),
  max_price: row.max_price == null ? null : Number(row.max_price),
});
const createPublicShowtimeService = ({ source = repository, pageCache = cache } = {}) => ({
  async list(query) {
    const page = parsePage(query);
    const key = `public:showtimes:v1:${crypto.createHash('sha256').update(JSON.stringify(page)).digest('hex')}`;
    const hit = await pageCache.get(key);
    if (hit) return hit;
    const rows = await source.listOnSale(page);
    const visible = rows.slice(0, page.limit);
    const hasMore = rows.length > page.limit;
    const result = {
      showtimes: visible.map(publicShowtime),
      pagination: { limit: page.limit, has_more: hasMore, next_cursor: hasMore ? encodeCursor(visible.at(-1)) : null },
    };
    await pageCache.set(key, result);
    return result;
  },
  async detail(id) {
    const row = await source.findPublic(id);
    if (!row) throw new PublicQueryError(404, 'Không tìm thấy suất diễn.');
    return { showtime: publicShowtime(row), on_sale: row.on_sale };
  },
  async seats(id) {
    const row = await source.seatMap(id);
    if (!row) throw new PublicQueryError(404, 'Không tìm thấy suất diễn.');
    if (!row.on_sale) throw new PublicQueryError(409, 'Suất diễn không mở bán.');
    return { showtime_id: row.showtime_id, seats: row.seats };
  },
});
module.exports = { PublicQueryError, parsePage, createPublicShowtimeService, ...createPublicShowtimeService() };
