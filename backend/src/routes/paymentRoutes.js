/**
 * SCRUM-212 [S-21] - Payment Routes
 * T-48: Kiểm chữ ký webhook trước khi đọc nội dung
 * T-49: Ghi log lần từ chối kèm địa chỉ nguồn
 */

const express = require('express');
const { createSecureRouter } = require('../middleware/secureRoute');
const { verifyWebhookSignature } = require('../middleware/webhookSignatureMiddleware');
const { handlePaymentWebhook } = require('../controllers/paymentController');

const paymentRouter = createSecureRouter();

// Parser raw buffer (tối đa 2MB) để kiểm tra HMAC-SHA256 trước khi parse JSON
const rawWebhookParser = express.raw({ type: '*/*', limit: '2mb' });

/**
 * Endpoint nhận webhook từ cổng thanh toán / mock gateway
 * Policy: { public: true } (được bảo vệ bằng chữ ký HMAC thay cho JWT)
 */
paymentRouter.post(
  '/webhook',
  { public: true },
  rawWebhookParser,
  verifyWebhookSignature,
  handlePaymentWebhook
);

module.exports = { paymentRouter };
