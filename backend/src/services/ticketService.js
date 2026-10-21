const QRCode = require('qrcode');
const { createTicketModel } = require('../models/Ticket');
const { signTicketCode } = require('../utils/ticketQr');

const ORDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class TicketServiceError extends Error {
  constructor(code, status, details) {
    super(code);
    this.name = 'TicketServiceError';
    this.code = code;
    this.status = status;
    if (details) this.details = details;
  }
}

/** Ảnh QR (data URL PNG) cho nội dung đã ký. Dùng chung cho trang vé (S-25) và email (S-27). */
const renderQrDataUrl = (code) => QRCode.toDataURL(code, { errorCorrectionLevel: 'M', margin: 2, width: 240 });

const createTicketService = ({ model = createTicketModel(), env = process.env } = {}) => {
  const present = async (ticket) => {
    const qrCode = signTicketCode(ticket.id, env);
    return {
      id: ticket.id,
      code: ticket.id.slice(0, 8).toUpperCase(),
      status: ticket.status,
      issuedAt: ticket.issuedAt,
      orderId: ticket.orderId,
      seat: { id: ticket.seatId, label: `${ticket.rowLabel}${ticket.seatNumber}`, row: ticket.rowLabel, number: ticket.seatNumber },
      category: ticket.categoryName,
      price: ticket.unitPrice,
      currency: ticket.currency,
      showtime: { id: ticket.showtimeId, startsAt: ticket.startsAt },
      event: { id: ticket.eventId, title: ticket.eventTitle, venue: ticket.venue },
      qrCode,
      qrImage: await renderQrDataUrl(qrCode),
    };
  };
  // Chỉ vé của đơn đã thanh toán được hiển thị
  const presentAll = (tickets) => Promise.all(tickets.filter((t) => t.orderStatus === 'paid').map(present));

  return {
    async listMyTickets({ userId }) {
      return presentAll(await model.findByUser(userId));
    },

    async getOrderTickets({ orderId, userId }) {
      if (!ORDER_ID_PATTERN.test(orderId || '')) throw new TicketServiceError('INVALID_ORDER_ID', 400);
      const order = await model.findOrder(orderId);
      if (!order) throw new TicketServiceError('ORDER_NOT_FOUND', 404);
      if (order.user_id !== userId) throw new TicketServiceError('ORDER_FORBIDDEN', 403);
      if (order.status !== 'paid') throw new TicketServiceError('ORDER_NOT_PAID', 409, { status: order.status });
      return presentAll(await model.findByOrder(orderId));
    },
  };
};

module.exports = { TicketServiceError, createTicketService, renderQrDataUrl };
