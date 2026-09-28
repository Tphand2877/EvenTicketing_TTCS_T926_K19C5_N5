const express = require('express');
const router = express.Router();

const { login, getProfile } = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');
const { validateLogin } = require('../middleware/validateMiddleware');

/**
 * POST /api/auth/login
 * Đăng nhập - không cần token
 */
router.post('/login', validateLogin, login);

/**
 * GET /api/auth/me
 * Xem thông tin bản thân - cần đăng nhập
 */
router.get('/me', authenticate, getProfile);

module.exports = router;
