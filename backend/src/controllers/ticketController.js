const { TicketServiceError } = require('../services/ticketService');
const { TicketQrConfigError } = require('../utils/ticketQr');

const MESSAGES = {
  INVALID_ORDER_ID: 'Mã đơn hàng không hợp lệ.',
  ORDER_NOT_FOUND: 'Không tìm thấy đơn hàng.',
  ORDER_FORBIDDEN: 'Bạn không có quyền xem vé của đơn hàng này.',
  ORDER_NOT_PAID: 'Đơn hàng chưa thanh toán. Vé điện tử chỉ được phát sau khi thanh toán thành công.',
};

const sendError = (error, res) => {
  if (error instanceof TicketServiceError) {
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

const createTicketController = ({ ticketService }) => ({
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
});

module.exports = { createTicketController };
