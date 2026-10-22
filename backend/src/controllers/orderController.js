const { createOrderService, OrderServiceError } = require('../services/orderService');

const createOrderController = ({ orderService = createOrderService() } = {}) => {
  const getMyOrders = async (req, res) => {
    try {
      const { page, limit, status } = req.query;
      const result = await orderService.getUserOrders({
        userId: req.user.userId,
        page,
        limit,
        status,
      });
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof OrderServiceError) {
        return res.status(error.status).json({
          success: false,
          code: error.code,
          message: error.message,
        });
      }
      return res.status(500).json({
        success: false,
        code: 'INTERNAL_ERROR',
        message: 'Lỗi máy chủ khi lấy danh sách đơn hàng.',
      });
    }
  };

  const getOrderDetail = async (req, res) => {
    try {
      const { orderId } = req.params;
      const result = await orderService.getOrderDetail({
        orderId,
        userId: req.user.userId,
      });
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof OrderServiceError) {
        return res.status(error.status).json({
          success: false,
          code: error.code,
          message: error.message,
        });
      }
      return res.status(500).json({
        success: false,
        code: 'INTERNAL_ERROR',
        message: 'Lỗi máy chủ khi lấy chi tiết đơn hàng.',
      });
    }
  };

  return { getMyOrders, getOrderDetail };
};

module.exports = {
  createOrderController,
};
