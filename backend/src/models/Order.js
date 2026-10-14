const db = require('../config/database');

const findById = (id) => db('orders')
  .select('*', db.raw('clock_timestamp() AS database_now'))
  .where({ id })
  .first();

// This single conditional UPDATE is the claim. PostgreSQL rechecks its WHERE
// clause after a concurrent updater commits, so only one caller may proceed.
const claimPaymentRequest = async ({ orderId, userId, amountMinor, currency, provider }) => {
  const rows = await db('orders')
    .where({
      id: orderId,
      user_id: userId,
      status: 'pending',
      total_amount: amountMinor,
      currency,
    })
    .andWhere('expires_at', '>', db.raw('clock_timestamp()'))
    .whereNull('gateway_provider')
    .whereNull('gateway_request_id')
    .update({
      gateway_provider: provider,
      gateway_request_id: orderId,
      payment_request_status: 'processing',
      payment_request_started_at: db.raw('clock_timestamp()'),
      payment_error_code: null,
      updated_at: db.raw('clock_timestamp()'),
    })
    .returning(['id']);

  return rows.length === 1;
};

const storePaymentUrl = async ({ orderId, userId, provider, gatewayRequestId, redirectUrl }) => {
  const rows = await db('orders')
    .where({
      id: orderId,
      user_id: userId,
      status: 'pending',
      gateway_provider: provider,
      gateway_request_id: gatewayRequestId,
    })
    .andWhere('expires_at', '>', db.raw('clock_timestamp()'))
    .update({
      payment_url: redirectUrl,
      payment_request_status: 'ready',
      payment_error_code: null,
      updated_at: db.raw('clock_timestamp()'),
    })
    .returning(['id']);

  return rows.length === 1;
};

const markPaymentRequestIndeterminate = async ({ orderId, provider, gatewayRequestId, errorCode }) => {
  const rows = await db('orders')
    .where({
      id: orderId,
      status: 'pending',
      gateway_provider: provider,
      gateway_request_id: gatewayRequestId,
    })
    .whereNull('payment_url')
    .update({
      payment_request_status: 'indeterminate',
      payment_error_code: errorCode,
      updated_at: db.raw('clock_timestamp()'),
    })
    .returning(['id']);

  return rows.length === 1;
};

/**
 * T-39 / S-17: Lấy chi tiết đơn hàng gồm tên sự kiện, suất diễn, danh sách ghế, hạng, đơn giá, tổng tiền, thời gian hết hạn.
 */
const getOrderDetails = async (id, transaction = db) => {
  const order = await transaction('orders')
    .select('orders.*', transaction.raw('clock_timestamp() AS database_now'))
    .where({ id })
    .first();

  if (!order) return null;

  // Lấy danh sách item kèm thông tin ghế và suất/sự kiện
  const items = await transaction('order_items')
    .join('seats', 'order_items.seat_id', 'seats.id')
    .select(
      'order_items.id',
      'order_items.seat_id',
      'order_items.category_name',
      'order_items.unit_price',
      'order_items.released_at',
      'seats.row_label',
      'seats.seat_number',
      'seats.showtime_id'
    )
    .where({ 'order_items.order_id': id })
    .orderBy(['seats.row_label', 'seats.seat_number', 'order_items.id']);

  let showtime = null;
  let event = null;
  if (items.length > 0 && items[0].showtime_id) {
    showtime = await transaction('showtimes')
      .where({ id: items[0].showtime_id })
      .first();
    if (showtime) {
      event = await transaction('events')
        .where({ id: showtime.event_id })
        .first();
    }
  }

  return {
    ...order,
    items,
    showtime: showtime ? {
      id: showtime.id,
      event_id: showtime.event_id,
      starts_at: showtime.starts_at,
      ends_at: showtime.ends_at,
      status: showtime.status,
    } : null,
    event: event ? {
      id: event.id,
      title: event.title,
      venue: event.venue,
      image_url: event.image_url,
    } : null,
  };
};

/**
 * T-38: Tạo đơn hàng từ lượt giữ ghế (seat_hold), tính tổng tiền từ giá hạng ghế máy chủ
 */
const createOrderFromHold = async ({ holdId, userId, now = new Date() }) => {
  const crypto = require('crypto');
  return db.transaction(async (trx) => {
    // 1. Kiểm tra seat_hold
    const hold = await trx('seat_holds')
      .where({ id: holdId })
      .forUpdate()
      .first();

    if (!hold) {
      const err = new Error('Không tìm thấy thông tin giữ chỗ.');
      err.code = 'HOLD_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (String(hold.user_id) !== String(userId)) {
      const err = new Error('Bạn không có quyền tạo đơn cho lượt giữ chỗ này.');
      err.code = 'HOLD_FORBIDDEN';
      err.status = 403;
      throw err;
    }

    const expiresAt = new Date(hold.expires_at).getTime();
    if (hold.status !== 'active' || expiresAt <= new Date(now).getTime()) {
      const err = new Error('Lượt giữ chỗ đã hết hạn hoặc bị hủy.');
      err.code = 'HOLD_EXPIRED';
      err.status = 409;
      throw err;
    }

    // 2. Lấy danh sách seat_ids từ seat_hold_seats
    const heldSeats = await trx('seat_hold_seats')
      .where({ hold_id: holdId })
      .orderBy('seat_id');

    let seatIds = heldSeats.map((s) => s.seat_id);

    // 3. Truy vấn bảng seats và seat_categories để lấy đơn giá chính xác
    let seatRows = [];
    if (seatIds.length > 0) {
      seatRows = await trx('seats')
        .leftJoin('seat_categories', function () {
          this.on('seats.category_id', '=', 'seat_categories.id')
            .andOn('seats.showtime_id', '=', 'seat_categories.showtime_id');
        })
        .select(
          'seats.id',
          'seats.row_label',
          'seats.seat_number',
          'seats.category_id',
          'seats.showtime_id',
          'seat_categories.name as category_name',
          'seat_categories.price as category_price'
        )
        .whereIn('seats.id', seatIds);
    } else {
      // Nếu là hold tổng (legacy), fallback tìm các ghế của showtime hoặc tạo placeholder
      const showtime = await trx('showtimes').where({ id: hold.showtime_id }).first();
      const showtimePrice = Number(showtime?.price || 0);
      for (let i = 1; i <= hold.quantity; i++) {
        seatRows.push({
          id: i,
          row_label: 'A',
          seat_number: i,
          category_name: 'Standard',
          category_price: showtimePrice,
        });
      }
    }

    // T-38: Tính tổng tiền tại máy chủ từ giá hạng ghế
    let calculatedTotal = 0;
    const itemsToInsert = [];
    const orderId = crypto.randomUUID();

    for (const seat of seatRows) {
      const unitPrice = Number(seat.category_price ?? 0);
      calculatedTotal += unitPrice;
      itemsToInsert.push({
        order_id: orderId,
        seat_id: seat.id,
        category_name: seat.category_name || 'Standard',
        unit_price: unitPrice,
      });
    }

    if (calculatedTotal <= 0) {
      calculatedTotal = Math.max(1, calculatedTotal);
    }

    // Lưu order
    await trx('orders').insert({
      id: orderId,
      user_id: userId,
      status: 'pending',
      total_amount: calculatedTotal,
      currency: 'VND',
      expires_at: hold.expires_at,
    });

    // Lưu order_items
    if (itemsToInsert.length > 0) {
      await trx('order_items').insert(itemsToInsert);
    }

    // Cập nhật seat_hold liên kết với order_id
    await trx('seat_holds').where({ id: holdId }).update({
      order_id: orderId,
      status: 'pending_payment',
    });

    return getOrderDetails(orderId, trx);
  });
};

module.exports = {
  findById,
  claimPaymentRequest,
  storePaymentUrl,
  markPaymentRequestIndeterminate,
  getOrderDetails,
  createOrderFromHold,
};

