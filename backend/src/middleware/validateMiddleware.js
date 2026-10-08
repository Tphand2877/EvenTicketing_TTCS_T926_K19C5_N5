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

// ─── SCRUM-80: Events & Showtimes ────────────────────────────────────────────

const EVENT_STATUSES = ['draft', 'published'];

const isNonEmptyString = (value, max) =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;

const isValidDate = (value) =>
  (typeof value === 'string' || typeof value === 'number') && !Number.isNaN(new Date(value).getTime());

const respondErrors = (res, errors) =>
  res.status(400).json({ success: false, errors, message: errors[0] });

/**
 * Validate dữ liệu event. partial = true cho cập nhật (chỉ kiểm tra field được gửi).
 * Chỉ các field trong whitelist được chuyển tiếp qua req.eventData
 * (không cho client tự gán organizer_id).
 */
const validateEvent = ({ partial = false } = {}) => (req, res, next) => {
  const body = req.body || {};
  const errors = [];
  const data = {};
  const has = (key) => body[key] !== undefined;

  if (!partial || has('title')) {
    if (!isNonEmptyString(body.title, 255)) errors.push('Tên sự kiện là bắt buộc (tối đa 255 ký tự).');
    else data.title = body.title.trim();
  }

  if (!partial || has('venue')) {
    if (!isNonEmptyString(body.venue, 255)) errors.push('Địa điểm là bắt buộc (tối đa 255 ký tự).');
    else data.venue = body.venue.trim();
  }

  if (has('category')) {
    if (!isNonEmptyString(body.category, 100)) errors.push('Danh mục không hợp lệ (tối đa 100 ký tự).');
    else data.category = body.category.trim();
  }

  if (has('description')) {
    if (body.description !== null && (typeof body.description !== 'string' || body.description.length > 5000)) {
      errors.push('Mô tả tối đa 5000 ký tự.');
    } else {
      data.description = body.description ? body.description.trim() : null;
    }
  }

  if (has('image_url')) {
    if (body.image_url === null || body.image_url === '') {
      data.image_url = null;
    } else if (typeof body.image_url !== 'string' || body.image_url.length > 500 || !/^https?:\/\//i.test(body.image_url)) {
      errors.push('Ảnh phải là đường dẫn http(s) hợp lệ.');
    } else {
      data.image_url = body.image_url.trim();
    }
  }

  if (has('status')) {
    if (!EVENT_STATUSES.includes(body.status)) errors.push(`Trạng thái phải là: ${EVENT_STATUSES.join(' | ')}.`);
    else data.status = body.status;
  }

  if (errors.length > 0) return respondErrors(res, errors);
  if (partial && Object.keys(data).length === 0) {
    return respondErrors(res, ['Không có dữ liệu nào để cập nhật.']);
  }

  req.eventData = data;
  next();
};

/**
 * Validate dữ liệu suất diễn. partial = true cho cập nhật.
 */
const validateShowtime = ({ partial = false } = {}) => (req, res, next) => {
  const body = req.body || {};
  const errors = [];
  const data = {};
  const has = (key) => body[key] !== undefined;

  if (!partial || has('starts_at')) {
    if (!isValidDate(body.starts_at)) errors.push('Thời gian bắt đầu (starts_at) không hợp lệ.');
    else data.starts_at = new Date(body.starts_at).toISOString();
  }

  if (has('ends_at') && body.ends_at !== null) {
    if (!isValidDate(body.ends_at)) errors.push('Thời gian kết thúc (ends_at) không hợp lệ.');
    else data.ends_at = new Date(body.ends_at).toISOString();
  } else if (has('ends_at')) {
    data.ends_at = null;
  }

  if (data.starts_at && data.ends_at && new Date(data.ends_at) <= new Date(data.starts_at)) {
    errors.push('Thời gian kết thúc phải sau thời gian bắt đầu.');
  }

  if (!partial || has('price')) {
    if (!Number.isInteger(body.price) || body.price < 0) errors.push('Giá vé phải là số nguyên >= 0.');
    else data.price = body.price;
  }

  if (!partial || has('capacity')) {
    if (!Number.isInteger(body.capacity) || body.capacity < 1 || body.capacity > 100000) {
      errors.push('Sức chứa phải là số nguyên từ 1 đến 100000.');
    } else {
      data.capacity = body.capacity;
    }
  }

  if (errors.length > 0) return respondErrors(res, errors);
  if (partial && Object.keys(data).length === 0) {
    return respondErrors(res, ['Không có dữ liệu nào để cập nhật.']);
  }

  req.showtimeData = data;
  next();
};

/**
 * SCRUM-84: Validate yêu cầu giữ chỗ
 */
const validateSeatHold = (req, res, next) => {
  const { quantity } = req.body || {};
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    return respondErrors(res, ['Số lượng vé giữ chỗ phải là số nguyên từ 1 đến 10.']);
  }
  next();
};

// ─── S-05 / T-12: Nạp sơ đồ ghế từ JSON ──────────────────────────────────────

const SEAT_MAP_MAX_SEATS = 10000;
const SEAT_MAP_MAX_CATEGORIES = 50;
const SEAT_MAP_MAX_ERRORS = 10;

/**
 * Body: { "seats": [ { "row": "A", "number": 1, "category": "VIP" }, ... ] }
 * Kiểm tra toàn bộ tệp TRƯỚC khi ghi DB; trả tối đa 10 lỗi, mỗi lỗi chỉ rõ vị trí ghế.
 * Kết quả chuẩn hoá (row/category đã trim) đặt vào req.seatMap.
 */
const validateSeatMap = (req, res, next) => {
  const seats = req.body?.seats;
  if (!Array.isArray(seats) || seats.length === 0) {
    return respondErrors(res, ['Tệp phải có mảng "seats" với ít nhất 1 ghế.']);
  }
  if (seats.length > SEAT_MAP_MAX_SEATS) {
    return respondErrors(res, [`Tệp có ${seats.length} ghế, vượt giới hạn ${SEAT_MAP_MAX_SEATS} ghế.`]);
  }

  const errors = [];
  const normalized = [];
  const positions = new Map();
  const categories = new Set();

  for (let i = 0; i < seats.length && errors.length < SEAT_MAP_MAX_ERRORS; i += 1) {
    const seat = seats[i];
    const label = `Ghế #${i + 1}`;
    if (seat === null || typeof seat !== 'object' || Array.isArray(seat)) {
      errors.push(`${label}: phải là object { row, number, category }.`);
      continue;
    }
    const row = typeof seat.row === 'string' ? seat.row.trim() : '';
    const category = typeof seat.category === 'string' ? seat.category.trim() : '';
    const seatErrors = [];
    if (!row || row.length > 10) seatErrors.push('"row" là chuỗi 1–10 ký tự');
    if (!Number.isInteger(seat.number) || seat.number < 1 || seat.number > 9999) {
      seatErrors.push('"number" là số nguyên 1–9999');
    }
    if (!category || category.length > 100) seatErrors.push('"category" là chuỗi 1–100 ký tự');
    if (seatErrors.length > 0) {
      errors.push(`${label}: ${seatErrors.join(', ')}.`);
      continue;
    }
    const key = `${row}\u0000${seat.number}`;
    if (positions.has(key)) {
      errors.push(`${label}: trùng ghế ${row}${seat.number} với ghế #${positions.get(key) + 1}.`);
      continue;
    }
    positions.set(key, i);
    categories.add(category);
    normalized.push({ row, number: seat.number, category });
  }

  if (errors.length === 0 && categories.size > SEAT_MAP_MAX_CATEGORIES) {
    errors.push(`Tệp có ${categories.size} hạng ghế, vượt giới hạn ${SEAT_MAP_MAX_CATEGORIES} hạng.`);
  }
  if (errors.length > 0) return respondErrors(res, errors);

  req.seatMap = normalized;
  next();
};

module.exports = {
  validateSeatMap,
  validateLogin,
  validateRegister,
  validateResendVerification,
  validateEvent,
  validateShowtime,
  validateSeatHold,
};
