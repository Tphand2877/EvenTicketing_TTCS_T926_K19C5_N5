/**
 * Demo các route được bảo vệ theo role
 * Dùng để test RBAC middleware (SCRUM-75) + deny-by-default (SCRUM-72 T-08)
 */

const { createSecureRouter } = require('../middleware/secureRoute');
const router = createSecureRouter();

// ✅ Mọi user đã đăng nhập đều xem được
router.get('/dashboard', { authenticated: true }, (req, res) => {
  res.json({
    success: true,
    message: `Xin chào ${req.user.email}! Role của bạn: ${req.user.role}`,
  });
});

// ✅ Chỉ admin
router.get('/admin/users', { roles: ['admin'] }, (req, res) => {
  res.json({ success: true, message: 'Danh sách người dùng (admin only)' });
});

// ✅ Admin hoặc organizer
router.get('/organizer/events', { roles: ['admin', 'organizer'] }, (req, res) => {
  res.json({ success: true, message: 'Quản lý sự kiện (admin + organizer)' });
});

// ✅ Tất cả roles nhưng phải đăng nhập
router.get('/buyer/tickets', { roles: ['admin', 'organizer', 'buyer'] }, (req, res) => {
  res.json({ success: true, message: 'Vé của tôi (tất cả roles)' });
});

module.exports = router;
