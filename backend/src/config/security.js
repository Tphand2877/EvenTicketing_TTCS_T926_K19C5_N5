/**
 * SCRUM-72 - Các hằng số cấu hình bảo mật dùng chung cho auth flow.
 * Gom về 1 chỗ để dễ chỉnh sửa mà không phải sửa rải rác trong code.
 */
const argon2 = require('argon2');

module.exports = {
  // T-07: Account lockout
  MAX_FAILED_ATTEMPTS: 5,
  LOCK_DURATION_MS: 15 * 60 * 1000, // 15 phút

  // T-09: Argon2id - tham số theo khuyến nghị OWASP Password Storage Cheat Sheet
  ARGON2_OPTIONS: {
    type: argon2.argon2id,
    memoryCost: 19456, // ~19 MiB
    timeCost: 2,
    parallelism: 1,
  },

  // T-09: Rate limit theo IP cho endpoint đăng nhập (độc lập với khóa theo tài khoản)
  IP_RATE_LIMIT: {
    WINDOW_MS: 15 * 60 * 1000, // 15 phút
    MAX_ATTEMPTS: 20, // 20 lần thử / IP / 15 phút (rộng hơn vì 1 IP có thể có nhiều user, vd văn phòng)
  },
};
