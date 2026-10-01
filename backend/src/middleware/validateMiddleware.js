/**
 * Middleware validate dữ liệu đầu vào cho các API Auth
 * SCRUM-74 [S-02]: validateLogin
 * SCRUM-76 [S-03]: validateRegister (AC3: password >= 8 characters), validateResendVerification
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
    return res.status(400).json({ success: false, errors, message: errors[0] });
  }

  // Normalize email
  req.body.email = email.trim().toLowerCase();
  next();
};

/**
 * SCRUM-76 AC3: Password validation
 * Mật khẩu < 8 ký tự bị chặn ở cả browser và server.
 */
const validateRegister = (req, res, next) => {
  const { email, password, full_name, name } = req.body;
  const errors = [];

  if (!email || typeof email !== 'string') {
    errors.push('Email là bắt buộc.');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.push('Email không đúng định dạng.');
  }

  if (!password || typeof password !== 'string') {
    errors.push('Mật khẩu là bắt buộc.');
  } else if (password.length < 8) {
    errors.push('Mật khẩu phải có ít nhất 8 ký tự.');
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors, message: errors[0] });
  }

  // Normalize data
  req.body.email = email.trim().toLowerCase();
  const resolvedName = full_name || name;
  if (resolvedName && typeof resolvedName === 'string') {
    req.body.full_name = resolvedName.trim();
  }

  next();
};

/**
 * Validate yêu cầu gửi lại email kích hoạt
 */
const validateResendVerification = (req, res, next) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({
      success: false,
      message: 'Email không đúng định dạng hoặc để trống.',
    });
  }

  req.body.email = email.trim().toLowerCase();
  next();
};

module.exports = {
  validateLogin,
  validateRegister,
  validateResendVerification,
};
