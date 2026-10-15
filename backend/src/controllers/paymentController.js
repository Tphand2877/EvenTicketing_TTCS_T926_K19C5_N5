/**
 * Payment Controller
 * - S-18 / T-41: Create payment and query payment status
 * - SCRUM-212 / S-21 (T-48, T-49): Webhook payment processing after signature verification
 */

const { PaymentServiceError, processPaymentWebhook } = require('../services/paymentService');

const ERROR_RESPONSES = {
  INVALID_ORDER_ID: [400, 'Mã đơn hàng không hợp lệ.'],
  ORDER_NOT_FOUND: [404, 'Không tìm thấy đơn hàng.'],
  ORDER_FORBIDDEN: [403, 'Bạn không có quyền thanh toán đơn hàng này.'],
  ORDER_ALREADY_PAID: [409, 'Đơn hàng đã được thanh toán.'],
  ORDER_NOT_PAYABLE: [409, 'Đơn hàng hiện không thể thanh toán.'],
  ORDER_EXPIRED: [409, 'Đơn hàng đã hết hạn thanh toán.'],
  ORDER_TOTAL_INVALID: [409, 'Tổng tiền đơn hàng không hợp lệ.'],
  PAYMENT_PROVIDER_MISMATCH: [409, 'Đơn hàng đã có yêu cầu thanh toán từ một cổng khác.'],
  PAYMENT_AMOUNT_UNSUPPORTED: [422, 'Cổng thanh toán không hỗ trợ số tiền của đơn hàng.'],
  PAYMENT_GATEWAY_UNAVAILABLE: [502, 'Chưa xác định được trạng thái yêu cầu thanh toán. Vui lòng liên hệ hỗ trợ.'],
  PAYMENT_GATEWAY_RESPONSE_INVALID: [502, 'Cổng thanh toán trả về dữ liệu không hợp lệ.'],
  PAYMENT_RECONCILIATION_REQUIRED: [409, 'Yêu cầu thanh toán cần được đối soát trước khi thử lại.'],
  PAYMENT_STATE_PERSIST_FAILED: [503, 'Chưa lưu được trạng thái thanh toán. Mã yêu cầu cần được đối soát.'],
  ORDER_STATE_CHANGED: [409, 'Trạng thái đơn hàng đã thay đổi. Hãy tải lại đơn trước khi thanh toán.'],
};

const sendPaymentError = (error, req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!(error instanceof PaymentServiceError)) {
    return res.status(500).json({
      success: false,
      code: 'PAYMENT_INTERNAL_ERROR',
      message: 'Không thể xử lý yêu cầu thanh toán.',
    });
  }
  const [status, message] = ERROR_RESPONSES[error.code] || [502, 'Không thể tạo yêu cầu thanh toán.'];
  const body = { success: false, code: error.code, message };
  if (error.details) body.details = error.details;
  if (['PAYMENT_GATEWAY_UNAVAILABLE', 'PAYMENT_GATEWAY_RESPONSE_INVALID', 'PAYMENT_STATE_PERSIST_FAILED']
    .includes(error.code)) {
    body.details = {
      orderId: req.params.orderId,
      gatewayRequestId: req.params.orderId,
      status: 'indeterminate',
    };
  }
  return res.status(status).json(body);
};

const sendPayment = (payment, res) => {
  res.set('Cache-Control', 'no-store');
  if (payment.status === 'processing') {
    const retryAfter = payment.retryAfterSeconds || 3;
    res.set('Retry-After', String(retryAfter));
    return res.status(202).json({ success: true, data: { payment } });
  }
  return res.status(200).json({ success: true, data: { payment } });
};

const createPaymentController = ({ paymentService }) => async (req, res) => {
  try {
    const payment = await paymentService.createPayment({
      orderId: req.params.orderId,
      userId: req.user.userId,
    });
    return sendPayment(payment, res);
  } catch (error) {
    return sendPaymentError(error, req, res);
  }
};

const createPaymentStatusController = ({ paymentService }) => async (req, res) => {
  try {
    const payment = await paymentService.getPaymentStatus({
      orderId: req.params.orderId,
      userId: req.user.userId,
    });
    return sendPayment(payment, res);
  } catch (error) {
    return sendPaymentError(error, req, res);
  }
};

/**
 * Controller xử lý kết quả thanh toán từ Webhook (S-21 / SCRUM-212)
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
  ERROR_RESPONSES,
  createPaymentController,
  createPaymentStatusController,
  handlePaymentWebhook,
};
