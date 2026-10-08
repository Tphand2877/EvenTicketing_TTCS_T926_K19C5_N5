const db = require('../config/database');

// T-11/T-15 schema contract is documented in docs/minh-quang-public-queries.md.
const publicFields = `s.id, s.event_id, e.title, e.description, e.category,
  e.venue, e.image_url, s.starts_at, s.ends_at, s.status`;
const createPublicShowtimeRepository = (database) => ({
  async listOnSale({ limit, after }) {
    const bindings = [];
    const seek = after ? 'AND (s.starts_at, s.id) > (?::timestamptz, ?::integer)' : '';
    if (after) bindings.push(after.startsAt, after.id);
    bindings.push(limit + 1);
    const { rows } = await database.raw(`
      WITH page AS (
        SELECT s.* FROM showtimes s JOIN events e ON e.id = s.event_id
        WHERE e.status = 'published' AND s.status = 'on_sale'
          AND s.starts_at > statement_timestamp() ${seek}
        ORDER BY s.starts_at, s.id LIMIT ?
      )
      SELECT ${publicFields}, prices.min_price, prices.max_price,
        to_char(s.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
      FROM page s JOIN events e ON e.id = s.event_id
      LEFT JOIN LATERAL (
        SELECT MIN((to_jsonb(c)->>'price')::numeric) AS min_price, MAX((to_jsonb(c)->>'price')::numeric) AS max_price
        FROM seat_categories c WHERE c.showtime_id = s.id
      ) prices ON true
      ORDER BY s.starts_at, s.id`, bindings);
    return rows;
  },
  async findPublic(id) {
    const { rows } = await database.raw(`
      SELECT ${publicFields}, prices.min_price, prices.max_price,
        (s.status = 'on_sale' AND s.starts_at > statement_timestamp()) AS on_sale
      FROM showtimes s JOIN events e ON e.id = s.event_id
      LEFT JOIN LATERAL (
        SELECT MIN((to_jsonb(c)->>'price')::numeric) AS min_price, MAX((to_jsonb(c)->>'price')::numeric) AS max_price
        FROM seat_categories c WHERE c.showtime_id = s.id
      ) prices ON true
      WHERE s.id = ? AND e.status = 'published'`, [id]);
    return rows[0];
  },
  async seatMap(id) {
    // Read adapters keep T-19 independent of colleagues' hold/ticket write models.
    // Missing adapters must fail closed, never label unidentified allocations free.
    const { rows } = await database.raw(`
      WITH target AS (
        SELECT s.id, (s.status = 'on_sale' AND s.starts_at > statement_timestamp()) AS on_sale
        FROM showtimes s JOIN events e ON e.id = s.event_id
        WHERE s.id = ? AND e.status = 'published'
      ), holds AS (
        SELECT h.seat_id, bool_or(h.status = 'confirmed') AS sold
        FROM public_seat_holds h JOIN target t ON t.id = h.showtime_id AND t.on_sale
        WHERE (h.status = 'active' AND h.expires_at > statement_timestamp())
          OR h.status IN ('pending_payment', 'confirmed')
        GROUP BY h.seat_id
      ), sold AS (
        SELECT DISTINCT v.seat_id FROM public_sold_seats v
        JOIN target t ON t.id = v.showtime_id AND t.on_sale
      ), states AS (
        SELECT s.id, s.row_label AS row, s.seat_number AS number,
          s.category_id, c.name AS category, (to_jsonb(c)->>'price')::numeric AS price,
          CASE WHEN v.seat_id IS NOT NULL OR h.sold THEN 'sold'
            WHEN h.seat_id IS NOT NULL THEN 'held' ELSE 'available' END AS status
        FROM seats s JOIN target t ON t.id = s.showtime_id AND t.on_sale
        LEFT JOIN seat_categories c ON c.id = s.category_id AND c.showtime_id = s.showtime_id
        LEFT JOIN holds h ON h.seat_id = s.id
        LEFT JOIN sold v ON v.seat_id = s.id
      )
      SELECT t.id AS showtime_id, t.on_sale,
        COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.row, s.number, s.id) FROM states s), '[]'::jsonb) AS seats
      FROM target t`, [id]);
    return rows[0];
  },
});

module.exports = { createPublicShowtimeRepository, ...createPublicShowtimeRepository(db) };
