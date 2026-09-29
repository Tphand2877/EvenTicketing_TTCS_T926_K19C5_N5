const { createSecureRouter } = require('../middleware/secureRoute');
const router = createSecureRouter();

const { login, getProfile } = require('../controllers/authController');
const { validateLogin } = require('../middleware/validateMiddleware');
const { loginIpRateLimiter } = require('../middleware/ipRateLimiter');

/**
 * POST /api/auth/login
 * Đăng nhập - công khai (không cần token), nhưng có rate-limit theo IP (SCRUM-72 T-09)
 */
router.post('/login', { public: true }, loginIpRateLimiter, validateLogin, login);

/**
 * GET /api/auth/me
 * Xem thông tin bản thân - cần đăng nhập (bất kỳ role nào)
 */
router.get('/me', { authenticated: true }, getProfile);

module.exports = router;
