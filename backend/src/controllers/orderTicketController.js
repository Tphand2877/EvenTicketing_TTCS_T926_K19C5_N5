const db = require('../config/database');
const { getOrderTickets } = require('../services/ticketService');
const { sendTicketEmailForOrder, TicketNotificationError } = require('../services/ticketNotificationService');

/**
 * SCRUM-223 [S-27] - Order Ticket Controller
 * Xử lý truy vấn vé và kích hoạt gửi email vé điện tử kèm mã QR
 */

const getOrderTicketsController = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    const order = await db('orders').where({ id: orderId }).first();
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    }

    // Kiểm tra quyền: Chỉ chủ đơn hàng hoặc Admin
    if (order.user_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem vé của đơn hàng này.' });
    }

    if (order.status !== 'paid') {
      return res.status(409).json({
        success: false,
        code: 'ORDER_NOT_PAID',
        message: 'Đơn hàng chưa thanh toán. Vé điện tử chỉ được phát hành sau khi thanh toán thành công.',
      });
    }

    const tickets = await getOrderTickets(orderId);

    return res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        status: order.status,
        totalAmount: order.total_amount,
        currency: order.currency,
        ticketCount: tickets.length,
        tickets,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const sendTicketEmailController = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const { email: overrideEmail } = req.body || {};

    const order = await db('orders').where({ id: orderId }).first();
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    }

    if (order.user_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền yêu cầu gửi vé cho đơn hàng này.' });
    }

    if (order.status !== 'paid') {
      return res.status(409).json({
        success: false,
        code: 'ORDER_NOT_PAID',
        message: 'Đơn hàng chưa được thanh toán thành công.',
      });
    }

    const result = await sendTicketEmailForOrder(orderId, { overrideEmail });

    return res.status(200).json({
      success: true,
      message: 'Vé điện tử kèm mã QR đã được gửi về email thành công.',
      data: result,
    });
  } catch (error) {
    if (error instanceof TicketNotificationError) {
      return res.status(error.status || 400).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }
    return next(error);
  }
};

module.exports = {
  getOrderTicketsController,
  sendTicketEmailController,
};
