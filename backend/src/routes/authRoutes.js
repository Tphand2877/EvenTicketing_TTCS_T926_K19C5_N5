const { createSecureRouter } = require('../middleware/secureRoute');
const router = createSecureRouter();

const {
  login,
  getProfile,
  register,
  verifyEmail,
  resendVerification,
} = require('../controllers/authController');
const {
  validateLogin,
  validateRegister,
  validateResendVerification,
} = require('../middleware/validateMiddleware');
const { loginIpRateLimiter } = require('../middleware/ipRateLimiter');

/**
 * POST /api/auth/register
 * SCRUM-76 [S-03] - Đăng ký tài khoản người mua
 */
router.post('/register', { public: true }, validateRegister, register);

/**
 * GET/POST /api/auth/verify-email
 * SCRUM-76 [S-03] - Kích hoạt tài khoản qua link email
 */
router.get('/verify-email', { public: true }, verifyEmail);
router.post('/verify-email', { public: true }, verifyEmail);

/**
 * POST /api/auth/resend-verification
 * SCRUM-76 [S-03] - Gửi lại email kích hoạt
 */
router.post(
  '/resend-verification',
  { public: true },
  validateResendVerification,
  resendVerification
);

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
