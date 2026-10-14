/**
 * Payment Routes
 * - S-18 / T-41: Order payment initiation and recovery
 * - SCRUM-212 / S-21 (T-48, T-49): Webhook payment processing
 */

const express = require('express');
const { createSecureRouter } = require('../middleware/secureRoute');
const {
  createPaymentController,
  createPaymentStatusController,
  handlePaymentWebhook,
} = require('../controllers/paymentController');
const { createPaymentService } = require('../services/paymentService');
const { verifyWebhookSignature } = require('../middleware/webhookSignatureMiddleware');

// Parser raw buffer (tối đa 2MB) để kiểm tra HMAC-SHA256 trước khi parse JSON
const rawWebhookParser = express.raw({ type: '*/*', limit: '2mb' });

const createPaymentRouter = ({ paymentService = createPaymentService() } = {}) => {
  const router = createSecureRouter();
  const controller = createPaymentController({ paymentService });
  const statusController = createPaymentStatusController({ paymentService });

  /**
   * Endpoint nhận webhook từ cổng thanh toán / mock gateway (SCRUM-212 / S-21)
   * Policy: { public: true } (được bảo vệ bằng chữ ký HMAC thay cho JWT)
   */
  router.post(
    '/webhook',
    { public: true },
    rawWebhookParser,
    verifyWebhookSignature,
    handlePaymentWebhook
  );

  // The amount comes from the persisted server-side order; request-body totals are ignored.
  router.post('/orders/:orderId', { authenticated: true }, controller);
  router.get('/orders/:orderId', { authenticated: true }, statusController);
  return router;
};

const paymentRouter = createPaymentRouter();

module.exports = { createPaymentRouter, paymentRouter, rawWebhookParser };
