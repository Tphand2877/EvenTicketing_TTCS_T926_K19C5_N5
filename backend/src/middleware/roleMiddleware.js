/**
 * SCRUM-75 [S-02 (T-06)] - Role-Based Access Control in Middleware
 * Middleware: kiểm tra quyền theo role
 */

/**
 * Middleware: authorize(...allowedRoles)
 * Kiểm tra role của user có nằm trong danh sách được phép không
 * Phải dùng SAU authenticate
 *
 * Ví dụ: authorize('admin', 'organizer')
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      req.denyReason = 'Chưa xác thực (authenticate chưa chạy)';
      return res.status(401).json({
        success: false,
        message: 'Chưa xác thực. Middleware authenticate phải chạy trước.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      req.denyReason = `Role '${req.user.role}' không được phép (yêu cầu: ${allowedRoles.join(', ')})`;
      return res.status(403).json({
        success: false,
        message: `Bạn không có quyền thực hiện hành động này. Yêu cầu role: ${allowedRoles.join(' hoặc ')}.`,
      });
    }

    next();
  };
};

module.exports = { authorize };
