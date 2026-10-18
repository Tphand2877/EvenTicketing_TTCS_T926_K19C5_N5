const { createSecureRouter } = require('../middleware/secureRoute');
const { createPaymentController, createPaymentStatusController } = require('../controllers/paymentController');
const { createPaymentService } = require('../services/paymentService');

const createPaymentRouter = ({ paymentService = createPaymentService() } = {}) => {
  const router = createSecureRouter();
  const controller = createPaymentController({ paymentService });
  const statusController = createPaymentStatusController({ paymentService });

  // The amount comes from the persisted server-side order; request-body totals are ignored.
  router.post('/orders/:orderId', { authenticated: true }, controller);
  router.get('/orders/:orderId', { authenticated: true }, statusController);
  return router;
};

const paymentRouter = createPaymentRouter();

module.exports = { createPaymentRouter, paymentRouter };
