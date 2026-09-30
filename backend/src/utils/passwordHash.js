/**
 * SCRUM-72 [S-02 (T-09)] - Password Hashing with Argon2id
 *
 * Chiến lược migrate: vì không thể "giải mã" hash bcrypt cũ để hash lại bằng Argon2id,
 * ta migrate LAZY (dần dần khi user đăng nhập thành công):
 *   1. Khi verify, nếu hash đang lưu là bcrypt và mật khẩu đúng -> trả needsRehash = true.
 *   2. Controller sẽ hash lại mật khẩu vừa nhập bằng Argon2id và lưu đè vào DB.
 * User nào không đăng nhập lại sẽ vẫn còn hash bcrypt cho tới lần đăng nhập kế tiếp,
 * điều này an toàn vì bcrypt vẫn xác thực đúng, chỉ là thuật toán cũ hơn.
 */

const argon2 = require('argon2');
const bcrypt = require('bcryptjs');
const { ARGON2_OPTIONS } = require('../config/security');

const isBcryptHash = (hash) => typeof hash === 'string' && /^\$2[aby]\$/.test(hash);
const isArgon2Hash = (hash) => typeof hash === 'string' && hash.startsWith('$argon2');

/**
 * Hash mật khẩu bằng Argon2id (dùng khi tạo user mới / đổi mật khẩu / migrate).
 */
async function hashPassword(plainPassword) {
  return argon2.hash(plainPassword, ARGON2_OPTIONS);
}

/**
 * Xác thực mật khẩu, hỗ trợ cả hash Argon2id (mới) và bcrypt (cũ, để migrate dần).
 * @returns {Promise<{valid: boolean, needsRehash: boolean}>}
 */
async function verifyPassword(plainPassword, storedHash) {
  if (isArgon2Hash(storedHash)) {
    const valid = await argon2.verify(storedHash, plainPassword);
    return { valid, needsRehash: false };
  }

  if (isBcryptHash(storedHash)) {
    const valid = await bcrypt.compare(plainPassword, storedHash);
    return { valid, needsRehash: valid };
  }

  // Hash không đúng định dạng nào đã biết -> coi như không hợp lệ
  return { valid: false, needsRehash: false };
}

module.exports = { hashPassword, verifyPassword, isBcryptHash, isArgon2Hash };
