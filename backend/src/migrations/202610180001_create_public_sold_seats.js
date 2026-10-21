/**
 * S-15 / T-19: view ghế đã bán cho API sơ đồ ghế và giữ chỗ theo mã ghế.
 * Ghế đã bán = order_items chưa nhả của đơn đã thanh toán (T-36/T-42).
 * Chỉ lộ showtime_id + seat_id, không lộ người mua hay đơn hàng.
 */
exports.up = (knex) => knex.raw(`
  CREATE VIEW public_sold_seats AS
  SELECT seats.showtime_id, items.seat_id
  FROM order_items AS items
  JOIN orders ON orders.id = items.order_id
  JOIN seats ON seats.id = items.seat_id
  WHERE orders.status = 'paid' AND items.released_at IS NULL
`);

exports.down = (knex) => knex.raw('DROP VIEW IF EXISTS public_sold_seats');
