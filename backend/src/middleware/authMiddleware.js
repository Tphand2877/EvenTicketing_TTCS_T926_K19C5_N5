/**
 * SCRUM-75 [S-02 (T-06)] - Role-Based Access Control in Middleware
 * Middleware: xác thực JWT
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware: authenticate
 * Xác thực token JWT trong header Authorization
 * Header format: "Authorization: Bearer <token>"
 * S-28 AC2 & AC3: Kiểm tra và đồng bộ vai trò/trạng thái người dùng thời gian thực từ Database
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.denyReason = 'Thiếu token xác thực';
    return res.status(401).json({
      success: false,
      message: 'Không tìm thấy token xác thực. Vui lòng đăng nhập.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { userId, role, email, iat, exp }

    // S-28 AC2 & AC3: Luôn lấy trạng thái và vai trò mới nhất từ DB (nếu có DB hoặc mock)
    if (User && typeof User.findById === 'function' && decoded.userId) {
      try {
        const freshUser = await User.findById(decoded.userId);
        if (freshUser) {
          // AC3: Nếu tài khoản bị vô hiệu hóa
          if (!freshUser.is_active || freshUser.deactivated_at) {
            req.denyReason = 'Tài khoản đã bị vô hiệu hóa';
            return res.status(403).json({
              success: false,
              message: 'Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên để được hỗ trợ.',
              isDeactivated: true,
            });
          }

          // AC2: Cập nhật role mới nhất từ database ngay trong request hiện tại
          req.user = {
            ...decoded,
            role: freshUser.role || decoded.role,
            email: freshUser.email || decoded.email,
            fullName: freshUser.full_name || decoded.fullName,
            isActive: freshUser.is_active,
          };
        }
      } catch {
        // Khi không kết nối được DB (trong standalone unit test), dùng nguyên thông tin từ token
      }
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      req.denyReason = 'Token đã hết hạn';
      return res.status(401).json({
        success: false,
        message: 'Token đã hết hạn. Vui lòng đăng nhập lại.',
      });
    }
    req.denyReason = 'Token không hợp lệ';
    return res.status(401).json({
      success: false,
      message: 'Token không hợp lệ.',
    });
  }
};

module.exports = { authenticate };
