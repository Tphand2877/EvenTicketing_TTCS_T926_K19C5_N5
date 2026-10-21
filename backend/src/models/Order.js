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
 * SCRUM-220 [S-32] (AC1, AC3, NFR): Lấy danh sách đơn hàng của người dùng có phân trang, mới nhất trước
 */
const getOrdersByUserId = async ({
  userId,
  page = 1,
  limit = 10,
  status,
  database = db,
}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  // Base query for user's orders
  const baseQuery = database('orders').where({ user_id: userId });
  if (status && ['pending', 'paid', 'cancelled', 'expired'].includes(status)) {
    baseQuery.where({ status });
  }

  // Count total orders
  const countRow = await baseQuery.clone().count('id as total').first();
  const totalOrders = parseInt(countRow?.total || 0, 10);
  const totalPages = Math.ceil(totalOrders / limitNum);

  // Fetch paginated orders, newest first
  const orderRows = await baseQuery.clone()
    .select(
      'orders.id',
      'orders.user_id',
      'orders.status',
      'orders.total_amount',
      'orders.currency',
      'orders.expires_at',
      'orders.gateway_provider',
      'orders.gateway_request_id',
      'orders.payment_url',
      'orders.created_at',
      'orders.updated_at',
      database.raw('clock_timestamp() AS database_now')
    )
    .orderBy('orders.created_at', 'desc')
    .orderBy('orders.id', 'desc')
    .limit(limitNum)
    .offset(offset);

  if (orderRows.length === 0) {
    return {
      orders: [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalOrders,
        totalPages,
        hasNextPage: false,
        hasPrevPage: pageNum > 1,
      },
    };
  }

  const orderIds = orderRows.map((o) => o.id);

  // Fetch order items with seat and showtime and event details
  const items = await database('order_items')
    .leftJoin('seats', 'order_items.seat_id', 'seats.id')
    .leftJoin('showtimes', 'seats.showtime_id', 'showtimes.id')
    .leftJoin('events', 'showtimes.event_id', 'events.id')
    .select(
      'order_items.id as item_id',
      'order_items.order_id',
      'order_items.seat_id',
      'order_items.category_name',
      'order_items.unit_price',
      'order_items.released_at',
      'seats.row_label',
      'seats.seat_number',
      'seats.showtime_id',
      'showtimes.starts_at as showtime_starts_at',
      'showtimes.ends_at as showtime_ends_at',
      'events.id as event_id',
      'events.title as event_title',
      'events.venue as event_venue',
      'events.image_url as event_image_url'
    )
    .whereIn('order_items.order_id', orderIds)
    .orderBy(['seats.row_label', 'seats.seat_number', 'order_items.id']);

  const itemsByOrderId = {};
  for (const item of items) {
    if (!itemsByOrderId[item.order_id]) {
      itemsByOrderId[item.order_id] = [];
    }
    itemsByOrderId[item.order_id].push(item);
  }

  const enrichedOrders = orderRows.map((order) => {
    const orderItems = itemsByOrderId[order.id] || [];
    const firstItem = orderItems[0] || null;

    const dbNow = order.database_now ? new Date(order.database_now) : new Date();
    let effectiveStatus = order.status;
    if (order.status === 'pending' && order.expires_at && new Date(order.expires_at) <= dbNow) {
      effectiveStatus = 'expired';
    }

    return {
      id: order.id,
      user_id: order.user_id,
      status: effectiveStatus,
      raw_status: order.status,
      total_amount: order.total_amount,
      currency: order.currency,
      seat_count: orderItems.length,
      seats: orderItems.map((item) => ({
        id: item.item_id,
        seat_id: item.seat_id,
        row_label: item.row_label,
        seat_number: item.seat_number,
        category_name: item.category_name,
        unit_price: item.unit_price,
        released_at: item.released_at,
      })),
      event: firstItem && firstItem.event_id ? {
        id: firstItem.event_id,
        title: firstItem.event_title,
        venue: firstItem.event_venue,
        image_url: firstItem.event_image_url,
      } : null,
      showtime: firstItem && firstItem.showtime_id ? {
        id: firstItem.showtime_id,
        starts_at: firstItem.showtime_starts_at,
        ends_at: firstItem.showtime_ends_at,
      } : null,
      expires_at: order.expires_at,
      created_at: order.created_at,
      updated_at: order.updated_at,
    };
  });

  return {
    orders: enrichedOrders,
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalOrders,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
    },
  };
};

/**
 * SCRUM-220 [S-32] (AC2): Lấy chi tiết một đơn hàng, kiểm tra quyền sở hữu
 */
const getOrderDetails = async ({ orderId, userId, database = db }) => {
  const order = await database('orders')
    .select('*', database.raw('clock_timestamp() AS database_now'))
    .where({ id: orderId })
    .first();

  if (!order) {
    const err = new Error('Không tìm thấy đơn hàng.');
    err.code = 'ORDER_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  // AC2: Kiểm tra quyền sở hữu - nếu gọi với mã đơn của người khác -> 403 Forbidden
  if (String(order.user_id) !== String(userId)) {
    const err = new Error('Bạn không có quyền xem đơn hàng này.');
    err.code = 'ORDER_FORBIDDEN';
    err.status = 403;
    throw err;
  }

  // Query order_items joined with seats
  const items = await database('order_items')
    .leftJoin('seats', 'order_items.seat_id', 'seats.id')
    .select(
      'order_items.id as item_id',
      'order_items.seat_id',
      'order_items.category_name',
      'order_items.unit_price',
      'order_items.released_at',
      'seats.row_label',
      'seats.seat_number',
      'seats.showtime_id'
    )
    .where('order_items.order_id', orderId)
    .orderBy(['seats.row_label', 'seats.seat_number', 'order_items.id']);

  let showtime = null;
  let event = null;
  if (items.length > 0 && items[0].showtime_id) {
    showtime = await database('showtimes')
      .where({ id: items[0].showtime_id })
      .first();
    if (showtime) {
      event = await database('events')
        .where({ id: showtime.event_id })
        .first();
    }
  }

  const dbNow = order.database_now ? new Date(order.database_now) : new Date();
  let effectiveStatus = order.status;
  if (order.status === 'pending' && order.expires_at && new Date(order.expires_at) <= dbNow) {
    effectiveStatus = 'expired';
  }

  return {
    id: order.id,
    user_id: order.user_id,
    status: effectiveStatus,
    raw_status: order.status,
    total_amount: order.total_amount,
    currency: order.currency,
    seat_count: items.length,
    seats: items.map((item) => ({
      id: item.item_id,
      seat_id: item.seat_id,
      row_label: item.row_label,
      seat_number: item.seat_number,
      category_name: item.category_name,
      unit_price: item.unit_price,
      released_at: item.released_at,
    })),
    event: event ? {
      id: event.id,
      title: event.title,
      venue: event.venue,
      image_url: event.image_url,
    } : null,
    showtime: showtime ? {
      id: showtime.id,
      starts_at: showtime.starts_at,
      ends_at: showtime.ends_at,
    } : null,
    expires_at: order.expires_at,
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
};

module.exports = {
  findById,
  claimPaymentRequest,
  storePaymentUrl,
  markPaymentRequestIndeterminate,
  getOrdersByUserId,
  getOrderDetails,
};
