/**
 * SCRUM-74 [S-02 (T-05)] - Log in by using email and password
 * Controller: xử lý logic đăng nhập
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

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

    // 2. So sánh password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không đúng.',
      });
    }

    // 3. Kiểm tra tài khoản đã kích hoạt chưa (S-03 sẽ xử lý kích hoạt)
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email để xác nhận.',
      });
    }

    // 4. Tạo JWT
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    // 5. Trả về response
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
