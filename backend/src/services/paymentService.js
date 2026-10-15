/**
 * SCRUM-212 [S-21] - Payment Webhook Service
 * T-48: Kiểm chữ ký webhook trước khi đọc nội dung
 * T-49: Ghi log lần từ chối kèm địa chỉ nguồn
 * S-18: Order payment initiation and recovery
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const AuditLog = require('../models/AuditLog');
const { persistDenial } = require('../middleware/auditLogger');
const Order = require('../models/Order');
const { createPaymentGateway } = require('../payments/createPaymentGateway');

const LOG_DIR = path.join(__dirname, '../../logs');
const WEBHOOK_AUDIT_LOG_FILE = path.join(LOG_DIR, 'audit.log');

const ORDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_CLAIM_STALE_MS = 2 * 60 * 1000;
const PROCESSING_RETRY_AFTER_SECONDS = 3;

class PaymentServiceError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'PaymentServiceError';
    this.code = code;
    if (details) this.details = details;
  }
}

const getPaymentProvider = (env = process.env) => (env.PAYMENT_PROVIDER || 'momo').trim().toLowerCase();

const isSafeRedirectUrl = (value) => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
};

const createPaymentService = ({
  orders = Order,
  gatewayFactory = createPaymentGateway,
  env = process.env,
  now = () => new Date(),
} = {}) => {
  let gateway;
  const resolveGateway = () => {
    if (!gateway) gateway = gatewayFactory({ env });
    return gateway;
  };

  const assertOrderNotExpired = (order) => {
    const databaseNow = order.database_now ? new Date(order.database_now) : now();
    if (!order.expires_at || new Date(order.expires_at) <= databaseNow) {
      throw new PaymentServiceError('ORDER_EXPIRED', 'Đơn hàng đã hết hạn thanh toán.');
    }
  };

  const findOwnedOrder = async ({ orderId, userId }) => {
    if (typeof orderId !== 'string' || orderId.length > 128 || !ORDER_ID_PATTERN.test(orderId)) {
      throw new PaymentServiceError('INVALID_ORDER_ID', 'Mã đơn hàng không hợp lệ.');
    }

    const order = await orders.findById(orderId);
    if (!order) throw new PaymentServiceError('ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.');
    if (String(order.user_id) !== String(userId)) {
      throw new PaymentServiceError('ORDER_FORBIDDEN', 'Bạn không có quyền xem hoặc thanh toán đơn hàng này.');
    }
    return order;
  };

  const findOwnedPendingOrder = async ({ orderId, userId }) => {
    const order = await findOwnedOrder({ orderId, userId });
    if (order.status === 'expired') {
      throw new PaymentServiceError('ORDER_EXPIRED', 'Đơn hàng đã hết hạn thanh toán.');
    }
    if (order.status === 'paid') {
      throw new PaymentServiceError('ORDER_ALREADY_PAID', 'Đơn hàng đã được thanh toán.');
    }
    if (order.status !== 'pending') {
      throw new PaymentServiceError('ORDER_NOT_PAYABLE', 'Đơn hàng hiện không thể thanh toán.');
    }
    assertOrderNotExpired(order);
    return order;
  };

  const getClaimStartedAt = (order) => order.payment_request_started_at || order.updated_at;

  const isClaimStale = (order) => {
    const startedAt = getClaimStartedAt(order);
    if (!startedAt) return true;
    const startedMs = new Date(startedAt).getTime();
    const currentMs = new Date(order.database_now || now()).getTime();
    return !Number.isFinite(startedMs) || !Number.isFinite(currentMs)
      || currentMs - startedMs >= PAYMENT_CLAIM_STALE_MS;
  };

  const markIndeterminate = async (order, errorCode) => {
    try {
      await orders.markPaymentRequestIndeterminate({
        orderId: order.id,
        provider: order.gateway_provider,
        gatewayRequestId: order.gateway_request_id,
        errorCode,
      });
    } catch {
      // Keep the claim. A later status read will classify an old processing
      // claim as indeterminate even if this update could not be saved.
    }
  };

  const reconciliationRequired = (order) => new PaymentServiceError(
    'PAYMENT_RECONCILIATION_REQUIRED',
    'Chưa xác định được kết quả thanh toán. Mã yêu cầu cần được đối soát trước khi thử lại.',
    { orderId: order.id, gatewayRequestId: order.gateway_request_id, status: 'indeterminate' },
  );

  const resolveClaimState = async (order) => {
    if (order.payment_url) {
      if (isSafeRedirectUrl(order.payment_url)) {
        return {
          status: 'ready',
          orderId: order.id,
          amountMinor: order.total_amount,
          currency: order.currency,
          gatewayRequestId: order.gateway_request_id,
          redirectUrl: order.payment_url,
        };
      }
      await markIndeterminate(order, 'INVALID_STORED_PAYMENT_URL');
      throw reconciliationRequired(order);
    }

    if (order.payment_request_status === 'indeterminate' || order.payment_request_status === 'ready'
      || isClaimStale(order)) {
      if (order.payment_request_status !== 'indeterminate') {
        await markIndeterminate(order, order.payment_error_code || 'CLAIM_TIMEOUT');
      }
      throw reconciliationRequired(order);
    }

    return {
      status: 'processing',
      orderId: order.id,
      amountMinor: order.total_amount,
      currency: order.currency,
      gatewayRequestId: order.gateway_request_id,
      retryAfterSeconds: PROCESSING_RETRY_AFTER_SECONDS,
    };
  };

  const assertSameClaim = (order, provider) => {
    if (order.gateway_provider !== provider || order.gateway_request_id !== order.id) {
      throw new PaymentServiceError('PAYMENT_PROVIDER_MISMATCH',
        'Đơn hàng đã có yêu cầu thanh toán từ một cổng khác.');
    }
  };

  const responseForStoredOrder = async (order, provider) => {
    assertSameClaim(order, provider);
    if (order.gateway_result_status === 'failed') {
      return { status: 'failed', orderId: order.id };
    }
    if (order.gateway_result_status === 'pending') {
      return { status: 'processing', orderId: order.id, retryAfterSeconds: PROCESSING_RETRY_AFTER_SECONDS };
    }
    return resolveClaimState(order);
  };

  const responseForFreshOrder = async ({ orderId, userId, provider }) => {
    const order = await findOwnedPendingOrder({ orderId, userId });
    assertSameClaim(order, provider);
    return order;
  };

  const validateGatewayResponse = (payment, order) => (
    payment && payment.gatewayRequestId === order.id && isSafeRedirectUrl(payment.redirectUrl)
  );

  return {
    async createPayment({ orderId, userId }) {
      const order = await findOwnedPendingOrder({ orderId, userId });

      if (!Number.isSafeInteger(order.total_amount) || order.total_amount <= 0 || order.currency !== 'VND') {
        throw new PaymentServiceError('ORDER_TOTAL_INVALID', 'Tổng tiền đơn hàng không hợp lệ.');
      }

      const provider = getPaymentProvider(env);
      if (order.gateway_request_id) {
        return responseForStoredOrder(order, provider);
      }
      if (order.gateway_provider) {
        throw new PaymentServiceError('PAYMENT_PROVIDER_MISMATCH',
          'Đơn hàng đã có yêu cầu thanh toán từ một cổng khác.');
      }

      if (provider === 'momo' && (order.total_amount < 1000 || order.total_amount > 50000000)) {
        throw new PaymentServiceError('PAYMENT_AMOUNT_UNSUPPORTED',
          'Cổng thanh toán không hỗ trợ số tiền của đơn hàng.');
      }

      const paymentGateway = resolveGateway();
      const claimed = await orders.claimPaymentRequest({
        orderId: order.id,
        userId,
        amountMinor: order.total_amount,
        currency: order.currency,
        provider,
      });
      if (!claimed) {
        const current = await findOwnedPendingOrder({ orderId: order.id, userId });
        if (current.gateway_request_id) return responseForStoredOrder(current, provider);
        throw new PaymentServiceError('ORDER_STATE_CHANGED',
          'Trạng thái đơn hàng đã thay đổi. Hãy tải lại đơn trước khi thanh toán.');
      }

      let payment;
      try {
        payment = await paymentGateway.createPayment({
          orderId: order.id,
          amountMinor: order.total_amount,
          currency: order.currency,
          orderInfo: `Ticket order ${order.id}`,
        });
      } catch (error) {
        const safeErrorCode = typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
          ? error.code
          : 'PROVIDER_OUTCOME_UNKNOWN';
        await markIndeterminate({ ...order, gateway_provider: provider, gateway_request_id: order.id }, safeErrorCode);
        if (error?.code === 'INVALID_PAYMENT_REQUEST') {
          throw new PaymentServiceError('PAYMENT_AMOUNT_UNSUPPORTED',
            'Cổng thanh toán không hỗ trợ số tiền của đơn hàng.');
        }
        throw new PaymentServiceError('PAYMENT_GATEWAY_UNAVAILABLE',
          'Chưa xác định được trạng thái yêu cầu thanh toán. Mã yêu cầu cần được đối soát.',
          { orderId: order.id, gatewayRequestId: order.id, status: 'indeterminate' });
      }

      if (!validateGatewayResponse(payment, order)) {
        await markIndeterminate({ ...order, gateway_provider: provider, gateway_request_id: order.id },
          'INVALID_PROVIDER_RESPONSE');
        throw new PaymentServiceError('PAYMENT_GATEWAY_RESPONSE_INVALID',
          'Cổng thanh toán trả về dữ liệu không hợp lệ. Mã yêu cầu cần được đối soát.',
          { orderId: order.id, gatewayRequestId: order.id, status: 'indeterminate' });
      }

      // Expiry may pass while the provider is responding. Re-read the order
      // using database time before persisting or returning its payment URL.
      await responseForFreshOrder({ orderId: order.id, userId, provider });

      let saved;
      try {
        saved = await orders.storePaymentUrl({
          orderId: order.id,
          userId,
          provider,
          gatewayRequestId: order.id,
          redirectUrl: payment.redirectUrl,
        });
      } catch {
        await markIndeterminate({ ...order, gateway_provider: provider, gateway_request_id: order.id },
          'PAYMENT_URL_PERSIST_FAILED');
        throw new PaymentServiceError('PAYMENT_STATE_PERSIST_FAILED',
          'Yêu cầu đã gửi tới cổng nhưng chưa lưu được đường dẫn. Mã yêu cầu cần được đối soát.',
          { orderId: order.id, gatewayRequestId: order.id, status: 'indeterminate' });
      }

      if (!saved) {
        const current = await responseForFreshOrder({ orderId: order.id, userId, provider });
        return resolveClaimState(current);
      }

      return {
        status: 'ready',
        orderId: order.id,
        amountMinor: order.total_amount,
        currency: order.currency,
        gatewayRequestId: payment.gatewayRequestId,
        redirectUrl: payment.redirectUrl,
      };
    },

    async getPaymentStatus({ orderId, userId }) {
      const order = await findOwnedOrder({ orderId, userId });
      const databaseNow = order.database_now ? new Date(order.database_now) : now();
      const expiresAt = new Date(order.expires_at).getTime();
      const expired = !Number.isFinite(expiresAt) || expiresAt <= new Date(databaseNow).getTime();

      if (order.status === 'paid') return { status: 'paid', orderId: order.id };
      if (order.status === 'needs_review') {
        return { status: 'needs_review', orderId: order.id, gatewayRequestId: order.gateway_request_id };
      }
      if (order.status === 'cancelled') return { status: 'cancelled', orderId: order.id };
      if (order.status === 'expired' || expired) return { status: 'expired', orderId: order.id };
      if (order.status !== 'pending') {
        throw new PaymentServiceError('ORDER_NOT_PAYABLE', 'Đơn hàng hiện không thể thanh toán.');
      }

      if (order.gateway_result_status === 'failed') {
        return { status: 'failed', orderId: order.id };
      }
      if (order.gateway_result_status === 'pending') {
        return { status: 'processing', orderId: order.id, retryAfterSeconds: PROCESSING_RETRY_AFTER_SECONDS };
      }

      if (!order.gateway_request_id && !order.gateway_provider) {
        return { status: 'not_started', orderId: order.id };
      }
      const provider = getPaymentProvider(env);
      return responseForStoredOrder(order, provider);
    },
  };
};

/**
 * Lấy khóa bí mật dùng để xác thực chữ ký webhook.
 * Mặc định 'mock-secret' để tương thích với mock gateway (SCRUM-203).
 */
function getWebhookSecret() {
  return process.env.PAYMENT_WEBHOOK_SECRET || process.env.MOCK_GATEWAY_SECRET || 'mock-secret';
}

/**
 * Tính toán HMAC-SHA256 của payload buffer.
 * @param {Buffer|string} payload - Raw request body
 * @param {string} [secret] - Khóa bí mật
 * @returns {string} Hex digest
 */
function computeSignature(payload, secret = getWebhookSecret()) {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || '', 'utf8');
  return crypto.createHmac('sha256', secret).update(buf).digest('hex');
}

/**
 * Trích xuất địa chỉ IP nguồn từ request một cách an toàn.
 * Hỗ trợ reverse proxy / load balancer qua header X-Forwarded-For.
 * @param {import('express').Request} req
 * @returns {string}
 */
function getClientIp(req) {
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return req.ip || (req.socket && req.socket.remoteAddress) || (req.connection && req.connection.remoteAddress) || 'unknown';
}

/**
 * Kiểm tra chữ ký webhook bằng so sánh độ dài và thời gian không đổi (timingSafeEqual).
 * @param {Buffer|string} rawBody - Raw body buffer trước khi parse
 * @param {string} providedSignature - Giá trị trong header X-Signature
 * @param {string} [secret] - Khóa bí mật
 * @returns {boolean}
 */
function verifySignature(rawBody, providedSignature, secret = getWebhookSecret()) {
  if (!providedSignature || typeof providedSignature !== 'string') {
    return false;
  }

  const expectedSignature = computeSignature(rawBody, secret);
  const cleanProvided = providedSignature.trim().replace(/^sha256=/i, '');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const providedBuf = Buffer.from(cleanProvided, 'utf8');

  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * T-49: Ghi log lần từ chối kèm địa chỉ nguồn (IP).
 * Ghi đồng thời ra file audit.log và bảng audit_logs trong cơ sở dữ liệu.
 * @param {import('express').Request} req
 * @param {number} statusCode - Mã trạng thái HTTP (401/403)
 * @param {string} reason - Lý do từ chối
 */
async function logWebhookRejection(req, statusCode, reason) {
  const clientIp = getClientIp(req);
  const endpoint = (req.originalUrl || req.url || '/api/payments/webhook').split('?')[0];

  const logEntry = {
    method: req.method || 'POST',
    endpoint,
    user_id: null,
    ip_address: clientIp,
    reason,
    status_code: statusCode,
    timestamp: new Date().toISOString(),
  };

  // 1. Ghi ra console cảnh báo kèm IP nguồn
  console.warn(`[Webhook Rejected] ${logEntry.method} ${logEntry.endpoint} - IP: ${clientIp} - Status: ${statusCode} - Reason: ${reason}`);

  // 2. Ghi ra file audit.log (best-effort)
  try {
    fs.mkdir(LOG_DIR, { recursive: true }, () => {
      const line = JSON.stringify(logEntry);
      fs.appendFile(WEBHOOK_AUDIT_LOG_FILE, line + '\n', () => {});
    });
  } catch (err) {
    console.error('[paymentService] Ghi file audit log thất bại:', err.message);
  }

  // 3. Ghi vào DB audit_logs (best-effort) qua persistDenial hoặc AuditLog
  try {
    await persistDenial(req, statusCode, reason);
  } catch {
    try {
      await AuditLog.create({
        method: logEntry.method,
        endpoint: logEntry.endpoint,
        user_id: null,
        ip_address: clientIp,
        reason,
        status_code: statusCode,
      });
    } catch (dbErr) {
      console.error('[paymentService] Ghi DB audit_logs thất bại:', dbErr.message);
    }
  }
}

/**
 * Xử lý dữ liệu webhook thanh toán hợp lệ.
 * @param {{ transactionId?: string, orderId: string, amount: number, status: 'SUCCESS'|'FAILED' }} payload
 */
async function processPaymentWebhook(payload) {
  const { transactionId, orderId, amount, status } = payload;

  return {
    processed: true,
    transactionId: transactionId || null,
    orderId,
    amount: typeof amount === 'number' ? amount : Number(amount) || 0,
    status,
    processedAt: new Date().toISOString(),
  };
}

module.exports = {
  ORDER_ID_PATTERN,
  PAYMENT_CLAIM_STALE_MS,
  PaymentServiceError,
  createPaymentService,
  getPaymentProvider,
  getWebhookSecret,
  computeSignature,
  getClientIp,
  verifySignature,
  logWebhookRejection,
  processPaymentWebhook,
};
