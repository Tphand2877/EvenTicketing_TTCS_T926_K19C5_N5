/**
 * SCRUM-212 [S-21] - Payment Controller
 * Xử lý webhook thanh toán sau khi chữ ký đã được kiểm tra tính hợp lệ.
 */

const { processPaymentWebhook } = require('../services/paymentService');

/**
 * Controller xử lý kết quả thanh toán từ Webhook
 * Route: POST /api/payments/webhook
 */
async function handlePaymentWebhook(req, res) {
  const { orderId, status, amount, transactionId } = req.body || {};

  if (!orderId || !status) {
    return res.status(400).json({
      success: false,
      message: 'Dữ liệu webhook không hợp lệ: thiếu orderId hoặc status.',
    });
  }

  const validStatuses = ['SUCCESS', 'FAILED'];
  if (!validStatuses.includes(String(status).toUpperCase())) {
    return res.status(400).json({
      success: false,
      message: `Trạng thái thanh toán không hợp lệ (hỗ trợ: ${validStatuses.join(', ')}).`,
    });
  }

  try {
    const result = await processPaymentWebhook({
      orderId,
      status: String(status).toUpperCase(),
      amount,
      transactionId,
    });

    return res.status(200).json({
      success: true,
      message: 'Webhook đã được xử lý thành công.',
      data: result,
    });
  } catch (err) {
    console.error('[paymentController] Lỗi xử lý webhook:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi xử lý webhook thanh toán.',
    });
  }
}

module.exports = {
  handlePaymentWebhook,
};
