/**
 * SCRUM-212 [S-21] - Webhook Signature Middleware
 * T-48: Kiểm chữ ký webhook trước khi đọc nội dung
 * T-49: Ghi log lần từ chối kèm địa chỉ nguồn
 */

const {
  verifySignature,
  logWebhookRejection,
} = require('../services/paymentService');

/**
 * Middleware kiểm tra chữ ký webhook TRƯỚC KHI đọc / phân tích nội dung JSON.
 * - Yêu cầu header X-Signature chứa chữ ký HMAC-SHA256 hex hợp lệ.
 * - Nếu thiếu chữ ký hoặc chữ ký không khớp: từ chối ngay lập tức (401),
 *   ghi log audit kèm IP nguồn (T-49), TUYỆT ĐỐI không đọc / parse nội dung JSON (T-48).
 * - Chỉ khi chữ ký hợp lệ mới tiến hành parse JSON từ raw buffer vào req.body.
 */
async function verifyWebhookSignature(req, res, next) {
  const signatureHeader = req.headers['x-signature'];

  // 1. Kiểm tra sự tồn tại của header chữ ký
  if (!signatureHeader || typeof signatureHeader !== 'string' || !signatureHeader.trim()) {
    const reason = 'Thiếu chữ ký webhook (header X-Signature)';
    req.denyReason = reason;

    // T-49: Ghi log lần từ chối kèm địa chỉ IP nguồn
    await logWebhookRejection(req, 401, reason);

    return res.status(401).json({
      success: false,
      message: 'Thiếu chữ ký webhook.',
    });
  }

  // 2. Lấy raw buffer từ body (được cấp bởi express.raw({ type: '*/*' }))
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}), 'utf8');

  // 3. T-48: Kiểm tra chữ ký mật mã trước khi đọc nội dung
  const isValid = verifySignature(rawBody, signatureHeader);

  if (!isValid) {
    const reason = 'Chữ ký webhook không hợp lệ';
    req.denyReason = reason;

    // T-49: Ghi log lần từ chối kèm địa chỉ IP nguồn
    await logWebhookRejection(req, 401, reason);

    return res.status(401).json({
      success: false,
      message: 'Chữ ký webhook không hợp lệ.',
    });
  }

  // 4. CHỈ KHI CHỮ KÝ HỢP LỆ mới bắt đầu đọc / parse nội dung JSON (T-48)
  try {
    const rawString = rawBody.toString('utf8');
    req.rawBody = rawString;
    req.body = rawString.trim().length > 0 ? JSON.parse(rawString) : {};
    next();
  } catch {
    // Nếu chữ ký đúng nhưng nội dung không phải JSON hợp lệ -> trả 400
    return res.status(400).json({
      success: false,
      message: 'Định dạng JSON không hợp lệ.',
    });
  }
}

module.exports = {
  verifyWebhookSignature,
};
