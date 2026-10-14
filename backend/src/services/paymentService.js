/**
 * SCRUM-212 [S-21] - Payment Webhook Service
 * T-48: Kiểm chữ ký webhook trước khi đọc nội dung
 * T-49: Ghi log lần từ chối kèm địa chỉ nguồn
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const AuditLog = require('../models/AuditLog');
const { persistDenial } = require('../middleware/auditLogger');

const LOG_DIR = path.join(__dirname, '../../logs');
const WEBHOOK_AUDIT_LOG_FILE = path.join(LOG_DIR, 'audit.log');

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
  getWebhookSecret,
  computeSignature,
  getClientIp,
  verifySignature,
  logWebhookRejection,
  processPaymentWebhook,
};
