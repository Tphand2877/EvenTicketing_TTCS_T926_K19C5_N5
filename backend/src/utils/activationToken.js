/**
 * SCRUM-76 [S-03] - Activation Token & Rate Limiting Utility
 *
 * Yêu cầu phi chức năng:
 * - Mã kích hoạt phải được tạo bằng bộ sinh số ngẫu nhiên an toàn (crypto.randomBytes).
 * - Mỗi mã kích hoạt chỉ được sử dụng một lần.
 * - Mã kích hoạt hết hạn sau 24 giờ.
 * - Mỗi email chỉ được yêu cầu gửi lại liên kết kích hoạt tối đa 5 lần mỗi giờ.
 */

const crypto = require('crypto');
const db = require('../config/database');

const MAX_RESEND_PER_HOUR = 5;
const TOKEN_TTL_HOURS = 24;

/**
 * Sinh mã kích hoạt ngẫu nhiên an toàn bằng crypto.randomBytes
 * @returns {string} 64-character hex token
 */
function generateActivationToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Tính thời điểm hết hạn sau 24 giờ
 * @returns {Date}
 */
function getActivationExpiresAt() {
  return new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);
}

/**
 * Kiểm tra mã kích hoạt đã hết hạn hay chưa
 * @param {string|Date} expiresAt
 * @returns {boolean} true nếu đã hết hạn
 */
function isTokenExpired(expiresAt) {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() <= Date.now();
}

/**
 * Kiểm tra giới hạn gửi lại email xác thực (tối đa 5 lần/giờ cho mỗi email)
 * @param {string} email
 * @returns {Promise<{ allowed: boolean, count: number, remaining: number }>}
 */
async function checkResendRateLimit(email) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const result = await db('verification_requests')
    .where('email', email)
    .where('created_at', '>=', oneHourAgo)
    .count('id as count')
    .first();

  const count = parseInt(result?.count || 0, 10);
  const allowed = count < MAX_RESEND_PER_HOUR;
  const remaining = Math.max(0, MAX_RESEND_PER_HOUR - count);

  return { allowed, count, remaining };
}

/**
 * Ghi nhận một yêu cầu gửi email xác thực
 * @param {string} email
 * @param {'register'|'resend'} [requestType='register']
 */
async function recordVerificationRequest(email, requestType = 'register') {
  return db('verification_requests').insert({
    email,
    request_type: requestType,
    created_at: db.fn.now(),
  });
}

module.exports = {
  MAX_RESEND_PER_HOUR,
  TOKEN_TTL_HOURS,
  generateActivationToken,
  getActivationExpiresAt,
  isTokenExpired,
  checkResendRateLimit,
  recordVerificationRequest,
};
