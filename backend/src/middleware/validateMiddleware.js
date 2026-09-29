/**
 * Middleware validate dữ liệu đầu vào cho các API Auth
 */

const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];

  if (!email || typeof email !== 'string') {
    errors.push('Email là bắt buộc.');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.push('Email không đúng định dạng.');
  }

  if (!password || typeof password !== 'string') {
    errors.push('Mật khẩu là bắt buộc.');
  } else if (password.length < 6) {
    errors.push('Mật khẩu phải có ít nhất 6 ký tự.');
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  // Normalize email
  req.body.email = email.trim().toLowerCase();
  next();
};

module.exports = { validateLogin };
