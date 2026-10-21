const { createSecureRouter } = require('../middleware/secureRoute');
const {
  createPaymentController,
  createPaymentStatusController,
  createOrderSummaryController,
  createOrderController,
} = require('../controllers/paymentController');
const { createPaymentService } = require('../services/paymentService');

const createPaymentRouter = ({ paymentService = createPaymentService(), orders } = {}) => {
  const router = createSecureRouter();
  const controller = createPaymentController({ paymentService });
  const statusController = createPaymentStatusController({ paymentService });
  const summaryController = createOrderSummaryController({ paymentService });
  const orderCreateController = createOrderController(orders ? { orders } : undefined);

  // T-38: Tạo đơn hàng từ lượt giữ ghế (server tính tổng tiền, bỏ qua số tiền từ client)
  router.post('/orders', { authenticated: true }, orderCreateController);

  // T-39 / S-17: Chi tiết tóm tắt đơn hàng (ghế, hạng, đơn giá, tổng tiền, thời gian còn lại)
  router.get('/orders/:orderId/summary', { authenticated: true }, summaryController);

  // The amount comes from the persisted server-side order; request-body totals are ignored.
  router.post('/orders/:orderId', { authenticated: true }, controller);
  router.get('/orders/:orderId', { authenticated: true }, statusController);
  return router;
};

const paymentRouter = createPaymentRouter();

module.exports = { createPaymentRouter, paymentRouter };

