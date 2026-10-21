const { createSecureRouter } = require('../middleware/secureRoute');
const { createStaffAccountController } = require('../controllers/staffAccountController');
const { createStaffAccountService } = require('../services/staffAccountService');

/** S-28: chỉ admin quản lý tài khoản và vai trò. */
const createAdminUserRouter = ({ service = createStaffAccountService() } = {}) => {
  const router = createSecureRouter();
  const controller = createStaffAccountController({ service });
  const ADMIN = { roles: ['admin'] };
  router.get('/roles', ADMIN, controller.listRoles);
  router.get('/users', ADMIN, controller.listUsers);
  router.post('/users', ADMIN, controller.createUser);
  router.patch('/users/:id', ADMIN, controller.updateUser);
  return router;
};

module.exports = { createAdminUserRouter, adminUserRouter: createAdminUserRouter() };
