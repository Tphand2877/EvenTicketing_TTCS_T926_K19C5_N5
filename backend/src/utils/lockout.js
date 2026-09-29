/**
 * SCRUM-72 [S-02 (T-07)] - Account Lockout After Failed Login Attempts
 */

const User = require('../models/User');
const { MAX_FAILED_ATTEMPTS, LOCK_DURATION_MS } = require('../config/security');

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  return {
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60,
  };
}

/**
 * Kiểm tra tài khoản có đang bị khóa không.
 * Nếu thời gian khóa đã hết hạn -> tự động reset bộ đếm về 0 trong DB (theo đúng yêu cầu AC3).
 * @returns {Promise<{locked: boolean, remainingMs?: number}>}
 */
async function checkLockStatus(user) {
  const lockedUntil = user.locked_until ? new Date(user.locked_until) : null;

  if (!lockedUntil) {
    return { locked: false };
  }

  const now = new Date();
  if (lockedUntil.getTime() > now.getTime()) {
    return { locked: true, remainingMs: lockedUntil.getTime() - now.getTime() };
  }

  // Hết hạn khóa -> reset bộ đếm về 0, cho phép thử lại
  await User.updateById(user.id, { failed_login_attempts: 0, locked_until: null });
  // Đồng bộ luôn object `user` đang được dùng trong request hiện tại,
  // để các bước xử lý tiếp theo (vd: registerFailedAttempt) thấy đúng trạng thái mới,
  // không bị "kẹt" với dữ liệu cũ đã lấy từ DB trước đó.
  user.failed_login_attempts = 0;
  user.locked_until = null;
  return { locked: false };
}

/**
 * Ghi nhận 1 lần đăng nhập sai. Khóa tài khoản nếu đạt ngưỡng MAX_FAILED_ATTEMPTS (mặc định: 5).
 * @returns {Promise<{locked: boolean, lockedUntil?: Date, remainingAttempts?: number}>}
 */
async function registerFailedAttempt(user) {
  const currentAttempts = user.failed_login_attempts || 0;
  const newAttempts = currentAttempts + 1;

  if (newAttempts >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
    await User.updateById(user.id, {
      failed_login_attempts: newAttempts,
      locked_until: lockedUntil,
    });
    return { locked: true, lockedUntil };
  }

  await User.updateById(user.id, { failed_login_attempts: newAttempts });
  return { locked: false, remainingAttempts: MAX_FAILED_ATTEMPTS - newAttempts };
}

/**
 * Đặt lại bộ đếm về 0 khi đăng nhập thành công.
 */
async function resetFailedAttempts(userId) {
  await User.updateById(userId, { failed_login_attempts: 0, locked_until: null });
}

module.exports = { checkLockStatus, registerFailedAttempt, resetFailedAttempts, formatRemaining };
