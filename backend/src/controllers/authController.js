/**
 * SCRUM-74 [S-02 (T-05)] - Log in by using email and password
 * SCRUM-72 [S-02 (T-07)] - Account Lockout After Failed Login Attempts
 * SCRUM-72 [S-02 (T-09)] - Password Hashing with Argon2id
 * Controller: xử lý logic đăng nhập
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { verifyPassword, hashPassword } = require('../utils/passwordHash');
const {
  checkLockStatus,
  registerFailedAttempt,
  resetFailedAttempts,
  formatRemaining,
} = require('../utils/lockout');

/**
 * POST /api/auth/login
 * Đăng nhập bằng email + password, trả về JWT
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Tìm user theo email
    const user = await User.findByEmail(email);
    if (!user) {
      // Dùng cùng message để tránh lộ thông tin "email tồn tại hay không"
      return res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không đúng.',
      });
    }

    // 2. [T-07] Kiểm tra tài khoản có đang bị khóa không - TRƯỚC khi xác thực mật khẩu
    const lockStatus = await checkLockStatus(user);
    if (lockStatus.locked) {
      const { minutes, seconds } = formatRemaining(lockStatus.remainingMs);
      return res.status(423).json({
        success: false,
        message: `Tài khoản đang bị khóa do đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${minutes} phút ${seconds} giây.`,
        lockedRemainingSeconds: Math.ceil(lockStatus.remainingMs / 1000),
      });
    }

    // 3. [T-09] So sánh password - hỗ trợ cả Argon2id (mới) và bcrypt (cũ, migrate dần)
    const { valid: isPasswordValid, needsRehash } = await verifyPassword(
      password,
      user.password_hash
    );

    if (!isPasswordValid) {
      // [T-07] Ghi nhận lần sai; nếu đạt ngưỡng thì khóa TỪ LÚC NÀY.
      // Response trả về 401 giống hệt trường hợp email không tồn tại để chống User Enumeration (BUG-02).
      await registerFailedAttempt(user);

      return res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không đúng.',
      });
    }

    // 4. [T-07] Mật khẩu đúng -> reset bộ đếm sai về 0
    await resetFailedAttempts(user.id);

    // 5. [T-09] Nếu hash đang là bcrypt cũ -> nâng cấp lên Argon2id (lazy migration)
    if (needsRehash) {
      const newHash = await hashPassword(password);
      await User.updateById(user.id, { password_hash: newHash });
    }

    // 6. Kiểm tra tài khoản đã kích hoạt chưa (S-03 sẽ xử lý kích hoạt)
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email để xác nhận.',
      });
    }

    // 7. Tạo JWT
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    // 8. Trả về response
    return res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công.',
      data: {
        accessToken: token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error('[AuthController.login] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ. Vui lòng thử lại sau.',
    });
  }
};

/**
 * GET /api/auth/me
 * Lấy thông tin user hiện tại (cần authenticate middleware)
 */
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng.',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error('[AuthController.getProfile] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ. Vui lòng thử lại sau.',
    });
  }
};

module.exports = { login, getProfile };
