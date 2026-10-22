/**
 * S-28: Admin Routes
 * Toàn bộ route chỉ cho phép role admin truy cập
 */

const { createSecureRouter } = require('../middleware/secureRoute');
const adminUserController = require('../controllers/adminUserController');

const router = createSecureRouter();

// Quản lý người dùng & phân quyền (S-28)
router.get('/users', { roles: ['admin'] }, adminUserController.listUsers);
router.get('/roles', { roles: ['admin'] }, adminUserController.getRoles);
router.post('/users', { roles: ['admin'] }, adminUserController.createStaffUser);
router.patch('/users/:id/role', { roles: ['admin'] }, adminUserController.updateUserRole);
router.patch('/users/:id/status', { roles: ['admin'] }, adminUserController.toggleUserStatus);
router.get('/role-change-logs', { roles: ['admin'] }, adminUserController.getRoleChangeLogs);

module.exports = router;
