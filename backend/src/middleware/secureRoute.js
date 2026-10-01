/**
 * SCRUM-72 [S-02 (T-08)] - Deny Access by Default for Unregistered Routes
 *
 * Bọc express.Router() để BẮT BUỘC khai báo access policy cho MỖI route.
 * Nếu dev quên khai báo -> mặc định bị từ chối (403), thay vì mặc định mở công khai
 * (đảo ngược model cũ "mặc định mở, phải tự thêm middleware mới bị chặn").
 *
 * Cách dùng:
 *   const { createSecureRouter } = require('../middleware/secureRoute');
 *   const router = createSecureRouter();
 *
 *   router.post('/login', { public: true }, validateLogin, login);
 *   router.get('/me', { authenticated: true }, getProfile);
 *   router.get('/admin/users', { roles: ['admin'] }, listUsers);
 *
 *   router.get('/quen-khai-bao', handler);
 *   // ^ Không khai báo policy (đối số thứ 2 không phải object policy) -> tự động trả 403
 */

const express = require('express');
const { authenticate } = require('./authMiddleware');
const { authorize } = require('./roleMiddleware');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

function createSecureRouter() {
  const router = express.Router();

  HTTP_METHODS.forEach((method) => {
    const original = router[method].bind(router);

    router[method] = (routePath, policyOrHandler, ...rest) => {
      const policyDeclared = isPolicyObject(policyOrHandler);

      if (!policyDeclared) {
        // Không khai báo policy -> deny by default, KHÔNG chạy bất kỳ handler nào đã truyền vào
        return original(routePath, denyByDefault(method, routePath));
      }

      const guard = buildPolicyGuard(policyOrHandler);
      return original(routePath, guard, ...rest);
    };
  });

  return router;
}

function isPolicyObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function denyByDefault(method, routePath) {
  return (req, res) => {
    req.denyReason = `Route ${method.toUpperCase()} ${routePath} chưa khai báo access policy (deny by default)`;
    return res.status(403).json({
      success: false,
      message: 'Truy cập bị từ chối: route chưa khai báo quyền truy cập.',
    });
  };
}

function buildPolicyGuard(policy) {
  return (req, res, next) => {
    if (policy.public) return next();

    // Mọi policy khác (authenticated / roles) đều cần xác thực JWT trước
    authenticate(req, res, () => {
      if (policy.roles && policy.roles.length > 0) {
        return authorize(...policy.roles)(req, res, next);
      }
      return next();
    });
  };
}

module.exports = { createSecureRouter };
