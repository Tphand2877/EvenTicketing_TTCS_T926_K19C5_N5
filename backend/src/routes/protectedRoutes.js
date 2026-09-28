/**
 * Demo các route được bảo vệ theo role
 * Dùng để test RBAC middleware (SCRUM-75)
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// ✅ Mọi user đã đăng nhập đều xem được
router.get('/dashboard', authenticate, (req, res) => {
  res.json({
    success: true,
    message: `Xin chào ${req.user.email}! Role của bạn: ${req.user.role}`,
  });
});

// ✅ Chỉ admin
router.get('/admin/users', authenticate, authorize('admin'), (req, res) => {
  res.json({ success: true, message: 'Danh sách người dùng (admin only)' });
});

// ✅ Admin hoặc organizer
router.get('/organizer/events', authenticate, authorize('admin', 'organizer'), (req, res) => {
  res.json({ success: true, message: 'Quản lý sự kiện (admin + organizer)' });
});

// ✅ Tất cả roles nhưng phải đăng nhập
router.get('/buyer/tickets', authenticate, authorize('admin', 'organizer', 'buyer'), (req, res) => {
  res.json({ success: true, message: 'Vé của tôi (tất cả roles)' });
});

module.exports = router;
