/**
 * SCRUM-75 [S-02 (T-06)] - Role-Based Access Control in Middleware
 * Middleware: xác thực JWT
 */

const jwt = require('jsonwebtoken');

/**
 * Middleware: authenticate
 * Xác thực token JWT trong header Authorization
 * Header format: "Authorization: Bearer <token>"
 */
const authenticate = (req, res, next) => {
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
