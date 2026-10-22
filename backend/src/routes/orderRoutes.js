const { createSecureRouter } = require('../middleware/secureRoute');
const { createOrderController } = require('../controllers/orderController');
const { createOrderService } = require('../services/orderService');

const createOrderRouter = ({ orderService = createOrderService() } = {}) => {
  const router = createSecureRouter();
  const controller = createOrderController({ orderService });

  // AC1 + NFR: Danh sách đơn hàng của người dùng (phân trang, mới nhất trước)
  router.get('/', { authenticated: true }, controller.getMyOrders);

  // AC2: Chi tiết đơn hàng (từ chối 403 nếu không phải chủ đơn)
  router.get('/:orderId', { authenticated: true }, controller.getOrderDetail);

  return router;
};

const orderRouter = createOrderRouter();

module.exports = {
  createOrderRouter,
  orderRouter,
};
