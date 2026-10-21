const db = require('../config/database');
const emailService = require('./emailService');
const { getOrderTickets } = require('./ticketService');

/**
 * SCRUM-223 [S-27] - Ticket Notification Service
 * Xử lý luồng gửi email vé điện tử kèm mã QR sau khi thanh toán thành công
 */

class TicketNotificationError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'TicketNotificationError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Gửi email vé điện tử cho một đơn hàng đã thanh toán
 * @param {string} orderId
 * @param {Object} options
 * @param {Object} [options.trx] - Knex transaction tùy chọn
 * @param {string} [options.overrideEmail] - Email chỉ định (nếu muốn gửi đến email khác)
 */
const sendTicketEmailForOrder = async (orderId, { trx = db, overrideEmail = null } = {}) => {
  if (!orderId || typeof orderId !== 'string') {
    throw new TicketNotificationError('INVALID_ORDER_ID', 'Mã đơn hàng không hợp lệ.', 400);
  }

  // 1. Kiểm tra đơn hàng
  const order = await trx('orders').where({ id: orderId }).first();
  if (!order) {
    throw new TicketNotificationError('ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.', 404);
  }

  if (order.status !== 'paid') {
    throw new TicketNotificationError(
      'ORDER_NOT_PAID',
      `Không thể gửi vé cho đơn hàng chưa thanh toán (Trạng thái hiện tại: ${order.status}).`,
      409,
    );
  }

  // 2. Lấy thông tin người mua
  const user = await trx('users').where({ id: order.user_id }).first();
  const recipientEmail = overrideEmail || user?.email;
  if (!recipientEmail) {
    throw new TicketNotificationError('RECIPIENT_EMAIL_MISSING', 'Không tìm thấy email người nhận vé.', 400);
  }

  // 3. Lấy danh sách vé đã cấp kèm mã QR có chữ ký
  const tickets = await getOrderTickets(orderId, trx);
  if (!tickets || tickets.length === 0) {
    throw new TicketNotificationError('ORDER_TICKETS_EMPTY', 'Đơn hàng không có ghế nào hợp lệ.', 400);
  }

  const sampleTicket = tickets[0];
  const event = {
    id: sampleTicket.eventId,
    title: sampleTicket.eventTitle,
    venue: sampleTicket.eventVenue,
    category: sampleTicket.eventCategory,
    imageUrl: sampleTicket.eventImageUrl,
  };
  const showtime = {
    id: sampleTicket.showtimeId,
    startsAt: sampleTicket.startsAt,
    endsAt: sampleTicket.endsAt,
  };

  // 4. Gửi email
  const mailRecord = await emailService.sendTicketEmail({
    to: recipientEmail,
    buyerName: user?.full_name || 'Quý khách',
    order,
    event,
    showtime,
    tickets,
  });

  return {
    success: true,
    orderId: order.id,
    recipientEmail,
    ticketCount: tickets.length,
    sentAt: mailRecord.sentAt,
  };
};

module.exports = {
  TicketNotificationError,
  sendTicketEmailForOrder,
};
