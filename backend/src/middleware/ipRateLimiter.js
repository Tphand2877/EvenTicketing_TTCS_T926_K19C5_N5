/**
 * SCRUM-72 [S-02 (T-09)] - Brute-force Protection by IP
 * Giới hạn số lần thử đăng nhập theo địa chỉ IP nguồn, ĐỘC LẬP với khóa theo tài khoản (T-07).
 * Mục đích: chống dò mật khẩu hàng loạt qua nhiều tài khoản khác nhau từ cùng 1 IP.
 */

const rateLimit = require('express-rate-limit');
const { IP_RATE_LIMIT } = require('../config/security');

const loginIpRateLimiter = rateLimit({
  windowMs: IP_RATE_LIMIT.WINDOW_MS,
  limit: IP_RATE_LIMIT.MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Quá nhiều lần thử đăng nhập từ địa chỉ IP này. Vui lòng thử lại sau ít phút.',
  },
});

module.exports = { loginIpRateLimiter };
