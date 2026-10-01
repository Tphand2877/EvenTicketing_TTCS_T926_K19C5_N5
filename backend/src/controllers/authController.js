/**
 * SCRUM-74 [S-02 (T-05)] - Log in by using email and password
 * SCRUM-72 [S-02 (T-07)] - Account Lockout After Failed Login Attempts
 * SCRUM-72 [S-02 (T-09)] - Password Hashing with Argon2id
 * SCRUM-76 [S-03] - Buyer Registration & Email Verification
 * Controller: xử lý logic xác thực, đăng ký và kích hoạt tài khoản
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');
const { verifyPassword, hashPassword } = require('../utils/passwordHash');
const {
  checkLockStatus,
  registerFailedAttempt,
  resetFailedAttempts,
  formatRemaining,
} = require('../utils/lockout');
const {
  generateActivationToken,
  getActivationExpiresAt,
  isTokenExpired,
  checkResendRateLimit,
  recordVerificationRequest,
} = require('../utils/activationToken');
const emailService = require('../services/emailService');

const GENERIC_REGISTRATION_MESSAGE =
  'Nếu email hợp lệ, bạn sẽ nhận được hướng dẫn kích hoạt tài khoản.';
const GENERIC_RESEND_MESSAGE =
  'Nếu email hợp lệ và chưa được kích hoạt, bạn sẽ nhận được liên kết kích hoạt mới.';

/**
 * POST /api/auth/register
 * SCRUM-76 [S-03] AC1, AC2, AC3: Đăng ký tài khoản người mua (role buyer)
 */
const register = async (req, res) => {
  try {
    const { email, password, full_name } = req.body;

    // AC2: Kiểm tra email đã tồn tại -> trả thông báo chung, không lộ email tồn tại
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(200).json({
        success: true,
        message: GENERIC_REGISTRATION_MESSAGE,
      });
    }

    // AC1: Tìm role buyer mặc định
    let buyerRole = await Role.findByName('buyer');
    const roleId = buyerRole ? buyerRole.id : 3;

    // Hash mật khẩu bằng Argon2id (SCRUM-72 T-09)
    const passwordHash = await hashPassword(password);

    // NFR 1 & 3: Sinh activation token an toàn (24h hết hạn)
    const activationToken = generateActivationToken();
    const activationTokenExpiresAt = getActivationExpiresAt();

    // Tạo tài khoản với trạng thái chưa kích hoạt (is_active = false)
    await User.create({
      email,
      password_hash: passwordHash,
      full_name: full_name || null,
      role_id: roleId,
      is_active: false,
      activation_token: activationToken,
      activation_token_expires_at: activationTokenExpiresAt,
    });

    // Ghi nhận lượt gửi để quản lý rate limit
    await recordVerificationRequest(email, 'register');

    // Gửi email kích hoạt
    await emailService.sendActivationEmail(email, activationToken, full_name);

    return res.status(201).json({
      success: true,
      message: GENERIC_REGISTRATION_MESSAGE,
    });
  } catch (error) {
    console.error('[AuthController.register] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ. Vui lòng thử lại sau.',
    });
  }
};

/**
 * GET/POST /api/auth/verify-email
 * SCRUM-76 [S-03] AC4: Xác nhận kích hoạt tài khoản qua activation token
 */
const verifyEmail = async (req, res) => {
  try {
    const token = req.query.token || req.body.token;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Mã kích hoạt không hợp lệ hoặc để trống.',
        canResend: true,
      });
    }

    // Tìm tài khoản theo activation_token
    const user = await User.findByActivationToken(token);

    if (!user) {
      // NFR 2: Token chỉ dùng 1 lần (dùng xong đã bị null) hoặc token giả
      return res.status(400).json({
        success: false,
        message: 'Liên kết kích hoạt không hợp lệ hoặc đã được sử dụng.',
        canResend: true,
      });
    }

    // AC4: Kiểm tra token đã quá 24 giờ hay chưa
    if (isTokenExpired(user.activation_token_expires_at)) {
      return res.status(400).json({
        success: false,
        message: 'Liên kết kích hoạt đã hết hạn (quá 24 giờ). Vui lòng yêu cầu gửi lại liên kết mới.',
        expired: true,
        canResend: true,
        email: user.email,
      });
    }

    // Kích hoạt thành công -> chuyển is_active = true, xóa token (single-use)
    await User.updateById(user.id, {
      is_active: true,
      activation_token: null,
      activation_token_expires_at: null,
    });

    return res.status(200).json({
      success: true,
      message: 'Kích hoạt tài khoản thành công! Bạn có thể đăng nhập ngay bây giờ.',
    });
  } catch (error) {
    console.error('[AuthController.verifyEmail] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ. Vui lòng thử lại sau.',
    });
  }
};

/**
 * POST /api/auth/resend-verification
 * SCRUM-76 [S-03] AC4 & NFR: Gửi lại email kích hoạt (giới hạn tối đa 5 lần/giờ)
 */
const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    // NFR 4: Giới hạn tối đa 5 lần mỗi giờ cho mỗi email
    const rateLimit = await checkResendRateLimit(email);
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        message: 'Bạn đã vượt quá giới hạn gửi lại email kích hoạt (tối đa 5 lần mỗi giờ). Vui lòng thử lại sau.',
        retryAfterMinutes: 60,
      });
    }

    // Kiểm tra user
    const user = await User.findByEmail(email);

    // NFR 5: Nếu không có user hoặc tài khoản đã active, vẫn trả thông báo chung
    if (!user || user.is_active) {
      return res.status(200).json({
        success: true,
        message: GENERIC_RESEND_MESSAGE,
      });
    }

    // Tạo token mới và gia hạn 24 giờ
    const newToken = generateActivationToken();
    const newExpiresAt = getActivationExpiresAt();

    await User.updateById(user.id, {
      activation_token: newToken,
      activation_token_expires_at: newExpiresAt,
    });

    // Ghi nhận lịch sử rate limit
    await recordVerificationRequest(email, 'resend');

    // Gửi email mới
    await emailService.sendActivationEmail(email, newToken, user.full_name);

    return res.status(200).json({
      success: true,
      message: GENERIC_RESEND_MESSAGE,
    });
  } catch (error) {
    console.error('[AuthController.resendVerification] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ. Vui lòng thử lại sau.',
    });
  }
};

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

    // 6. [SCRUM-76 AC5] Kiểm tra tài khoản đã kích hoạt chưa
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email để kích hoạt tài khoản trước khi đăng nhập.',
        needActivation: true,
      });
    }

    // 7. Tạo JWT access token
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });

    return res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công.',
      data: {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: process.env.JWT_EXPIRES_IN || '8h',
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

module.exports = {
  login,
  getProfile,
  register,
  verifyEmail,
  resendVerification,
};
