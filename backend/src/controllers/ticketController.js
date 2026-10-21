const { TicketServiceError } = require('../services/ticketService');
const { TicketNotificationError } = require('../services/ticketNotificationService');
const { TicketQrConfigError } = require('../utils/ticketQr');

const MESSAGES = {
  INVALID_ORDER_ID: 'Mã đơn hàng không hợp lệ.',
  ORDER_NOT_FOUND: 'Không tìm thấy đơn hàng.',
  ORDER_FORBIDDEN: 'Bạn không có quyền xem vé của đơn hàng này.',
  ORDER_NOT_PAID: 'Đơn hàng chưa thanh toán. Vé điện tử chỉ được phát sau khi thanh toán thành công.',
  EMAIL_RECENTLY_SENT: 'Vé vừa được gửi. Vui lòng kiểm tra hộp thư (cả mục Spam) hoặc thử lại sau 1 phút.',
  EMAIL_IN_PROGRESS: 'Email vé đang được gửi. Vui lòng kiểm tra hộp thư sau ít phút.',
  EMAIL_DELIVERY_FAILED: 'Chưa gửi được email. Hệ thống sẽ tự thử lại.',
};

const sendError = (error, res) => {
  if (error instanceof TicketServiceError || error instanceof TicketNotificationError) {
    const body = { success: false, code: error.code, message: MESSAGES[error.code] };
    if (error.details) body.details = error.details;
    return res.status(error.status).json(body);
  }
  if (error instanceof TicketQrConfigError) {
    console.error('[Tickets] QR signing key is not configured.');
    return res.status(503).json({ success: false, code: error.code, message: 'Chưa thể tạo mã QR cho vé.' });
  }
  console.error('[Tickets] Request failed.');
  return res.status(500).json({ success: false, message: 'Không tải được vé.' });
};

const ORDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createTicketController = ({ ticketService, ticketEmails }) => ({
  async listMine(req, res) {
    try {
      res.set('Cache-Control', 'no-store');
      const tickets = await ticketService.listMyTickets({ userId: req.user.userId });
      return res.json({ success: true, data: { tickets } });
    } catch (error) {
      return sendError(error, res);
    }
  },

  async listForOrder(req, res) {
    try {
      res.set('Cache-Control', 'no-store');
      const tickets = await ticketService.getOrderTickets({ orderId: req.params.orderId, userId: req.user.userId });
      return res.json({ success: true, data: { orderId: req.params.orderId, tickets } });
    } catch (error) {
      return sendError(error, res);
    }
  },

  /** S-27: người mua yêu cầu gửi (lại) vé qua email */
  async emailOrderTickets(req, res) {
    try {
      if (!ORDER_ID_PATTERN.test(req.params.orderId)) throw new TicketServiceError('INVALID_ORDER_ID', 400);
      await ticketEmails.resend({ orderId: req.params.orderId, userId: req.user.userId });
      return res.json({ success: true, message: 'Đã gửi vé về email của bạn.' });
    } catch (error) {
      return sendError(error, res);
    }
  },
});

module.exports = { createTicketController };
