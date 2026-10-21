const QRCode = require('qrcode');
const db = require('../config/database');
const { signTicketPayload } = require('../utils/ticketSignature');

/**
 * SCRUM-223 [S-27] - Ticket Service
 * Truy vấn thông tin vé của đơn hàng, sinh mã định danh và QR code có chữ ký
 */

/**
 * Sinh mã vé chuẩn (canonical ticket ID)
 */
const generateTicketId = (orderId, seatId) => {
  const shortOrder = (orderId || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return `TKT-${shortOrder}-${seatId}`;
};

/**
 * Sinh chuỗi QR có chữ ký bảo mật và tạo ảnh Data URL
 */
const generateTicketQrCode = async ({ ticketId, orderId, showtimeId, seatId, seatLabel, categoryName }) => {
  const sig = signTicketPayload({ ticketId, orderId, showtimeId, seatId, seatLabel });
  const qrPayload = JSON.stringify({
    t: ticketId,
    o: orderId,
    s: showtimeId,
    seat: seatLabel,
    cat: categoryName,
    sig,
  });

  const [qrCodeDataUrl, qrCodeSvg] = await Promise.all([
    QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 200,
      color: { dark: '#111827', light: '#FFFFFF' },
    }),
    QRCode.toString(qrPayload, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
    }),
  ]);

  return {
    qrPayload,
    signature: sig,
    qrCodeDataUrl,
    qrCodeSvg,
  };
};

/**
 * Lấy danh sách vé hoàn chỉnh (kèm QR code) của một đơn hàng
 * @param {string} orderId
 * @param {Object} [trx] - Knex transaction (tùy chọn)
 */
const getOrderTickets = async (orderId, trx = db) => {
  const rows = await trx('order_items as item')
    .join('orders as ord', 'ord.id', 'item.order_id')
    .join('seats as st', 'st.id', 'item.seat_id')
    .join('showtimes as sht', 'sht.id', 'st.showtime_id')
    .join('events as evt', 'evt.id', 'sht.event_id')
    .select(
      'ord.id as orderId',
      'ord.status as orderStatus',
      'ord.user_id as userId',
      'ord.total_amount as totalAmount',
      'ord.currency',
      'ord.created_at as orderCreatedAt',
      'item.id as orderItemId',
      'item.seat_id as seatId',
      'item.category_name as categoryName',
      'item.unit_price as unitPrice',
      'st.row_label as rowLabel',
      'st.seat_number as seatNumber',
      'sht.id as showtimeId',
      'sht.starts_at as startsAt',
      'sht.ends_at as endsAt',
      'evt.id as eventId',
      'evt.title as eventTitle',
      'evt.venue as eventVenue',
      'evt.category as eventCategory',
      'evt.image_url as eventImageUrl',
    )
    .where('item.order_id', orderId)
    .whereNull('item.released_at')
    .orderBy(['st.row_label', 'st.seat_number']);

  if (!rows || rows.length === 0) {
    return [];
  }

  const tickets = await Promise.all(
    rows.map(async (row) => {
      const seatLabel = `${row.rowLabel}${row.seatNumber}`;
      const ticketId = generateTicketId(row.orderId, row.seatId);
      const { qrPayload, signature, qrCodeDataUrl, qrCodeSvg } = await generateTicketQrCode({
        ticketId,
        orderId: row.orderId,
        showtimeId: row.showtimeId,
        seatId: row.seatId,
        seatLabel,
        categoryName: row.categoryName,
        startsAt: row.startsAt,
        venue: row.eventVenue,
      });

      return {
        ticketId,
        orderId: row.orderId,
        orderItemId: row.orderItemId,
        seatId: row.seatId,
        seatLabel,
        rowLabel: row.rowLabel,
        seatNumber: row.seatNumber,
        categoryName: row.categoryName,
        unitPrice: row.unitPrice,
        showtimeId: row.showtimeId,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        eventId: row.eventId,
        eventTitle: row.eventTitle,
        eventVenue: row.eventVenue,
        eventCategory: row.eventCategory,
        eventImageUrl: row.eventImageUrl,
        signature,
        qrPayload,
        qrCodeDataUrl,
        qrCodeSvg,
      };
    }),
  );

  return tickets;
};

module.exports = {
  generateTicketId,
  generateTicketQrCode,
  getOrderTickets,
};
