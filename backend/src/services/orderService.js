const Order = require('../models/Order');

const ORDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class OrderServiceError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'OrderServiceError';
    this.code = code;
    this.status = status;
  }
}

const createOrderService = ({ orders = Order } = {}) => ({
  /**
   * AC1 & NFR: Lấy danh sách đơn hàng của người dùng có phân trang, mới nhất trước
   */
  async getUserOrders({ userId, page = 1, limit = 10, status } = {}) {
    if (!userId) {
      throw new OrderServiceError('UNAUTHORIZED', 'Yêu cầu đăng nhập.', 401);
    }
    return orders.getOrdersByUserId({ userId, page, limit, status });
  },

  /**
   * AC2: Lấy chi tiết đơn hàng, từ chối 403 nếu không phải chủ đơn
   */
  async getOrderDetail({ orderId, userId } = {}) {
    if (!userId) {
      throw new OrderServiceError('UNAUTHORIZED', 'Yêu cầu đăng nhập.', 401);
    }
    if (typeof orderId !== 'string' || !ORDER_ID_PATTERN.test(orderId)) {
      throw new OrderServiceError('INVALID_ORDER_ID', 'Mã đơn hàng không hợp lệ.', 400);
    }

    try {
      return await orders.getOrderDetails({ orderId, userId });
    } catch (err) {
      if (err.code === 'ORDER_NOT_FOUND') {
        throw new OrderServiceError('ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.', 404);
      }
      if (err.code === 'ORDER_FORBIDDEN') {
        throw new OrderServiceError('ORDER_FORBIDDEN', 'Bạn không có quyền xem đơn hàng này.', 403);
      }
      throw err;
    }
  },
});

module.exports = {
  ORDER_ID_PATTERN,
  OrderServiceError,
  createOrderService,
};
