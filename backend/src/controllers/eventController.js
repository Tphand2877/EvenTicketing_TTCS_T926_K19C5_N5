/**
 * SCRUM-80 - Events & Showtimes
 *  - Buyer (public): xem danh sách event đã publish, xem chi tiết + suất diễn
 *  - Organizer/Admin: CRUD event và suất diễn
 *    (organizer chỉ quản lý event của chính mình, admin quản lý tất cả)
 *
 * SCRUM-84 (spike) - Giữ chỗ có thời hạn cho một suất diễn
 *
 * S-05 / T-12 - Organizer nạp sơ đồ ghế từ tệp JSON
 * S-07 / T-15 - Mở bán / đóng bán suất diễn
 */

const Event = require('../models/Event');
const Showtime = require('../models/Showtime');
const seatHoldService = require('../services/seatHoldService');
const seatMapService = require('../services/seatMapService');
const showtimeSaleService = require('../services/showtimeSaleService');

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const parseId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const parsePositiveInt = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const canManage = (event, user) =>
  user.role === 'admin' || event.organizer_id === user.userId;

const formatEvent = (event) => ({
  ...event,
  min_price: event.min_price === null || event.min_price === undefined ? null : Number(event.min_price),
  showtime_count: Number(event.showtime_count || 0),
});

const notFound = (res, message = 'Không tìm thấy sự kiện.') =>
  res.status(404).json({ success: false, message });

const forbidden = (res) =>
  res.status(403).json({ success: false, message: 'Bạn không có quyền quản lý sự kiện này.' });

/**
 * Lấy event mà user được quyền quản lý. Trả về null nếu đã gửi response lỗi.
 */
const loadManageableEvent = async (eventId, req, res) => {
  const event = eventId ? await Event.findById(eventId) : null;
  if (!event) {
    notFound(res);
    return null;
  }
  if (!canManage(event, req.user)) {
    req.denyReason = `User ${req.user.userId} không sở hữu event ${eventId}`;
    forbidden(res);
    return null;
  }
  return event;
};

/**
 * Lấy suất diễn + event cha mà user được quyền quản lý.
 */
const loadManageableShowtime = async (showtimeId, req, res) => {
  const showtime = showtimeId ? await Showtime.findById(showtimeId) : null;
  if (!showtime) {
    notFound(res, 'Không tìm thấy suất diễn.');
    return null;
  }
  const event = await loadManageableEvent(showtime.event_id, req, res);
  return event ? showtime : null;
};

// ─── Public (buyer) ──────────────────────────────────────────────────────────

/**
 * GET /api/events?q=&category=&page=&limit=
 */
const listEvents = async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';

    const { rows, total } = await Event.listPublished({
      search,
      category,
      limit,
      offset: (page - 1) * limit,
    });

    return res.json({
      success: true,
      data: {
        events: rows.map(formatEvent),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/events/:id — chỉ event đã publish
 */
const getEvent = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const event = id ? await Event.findPublicById(id) : null;
    if (!event || event.status !== 'published') return notFound(res);

    // S-07: người mua không thấy suất nháp; suất đã đóng bán vẫn hiện (không giữ chỗ được)
    const showtimes = await Showtime.listVisibleByEvent(id);
    return res.json({
      success: true,
      data: { event: formatEvent(event), showtimes },
    });
  } catch (err) {
    return next(err);
  }
};

// ─── Organizer / Admin ───────────────────────────────────────────────────────

/**
 * GET /api/events/mine — organizer xem event của mình (admin xem tất cả)
 */
const listMyEvents = async (req, res, next) => {
  try {
    const rows = req.user.role === 'admin'
      ? await Event.listAll()
      : await Event.listByOrganizer(req.user.userId);
    return res.json({ success: true, data: { events: rows.map(formatEvent) } });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/events
 */
const createEvent = async (req, res, next) => {
  try {
    const [event] = await Event.create({ ...req.eventData, organizer_id: req.user.userId });
    return res.status(201).json({ success: true, message: 'Tạo sự kiện thành công.', data: { event } });
  } catch (err) {
    return next(err);
  }
};

/**
 * PATCH /api/events/:id
 */
const updateEvent = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!(await loadManageableEvent(id, req, res))) return undefined;

    const [event] = await Event.updateById(id, req.eventData);
    return res.json({ success: true, message: 'Cập nhật sự kiện thành công.', data: { event } });
  } catch (err) {
    return next(err);
  }
};

/**
 * DELETE /api/events/:id — xóa kèm toàn bộ suất diễn (ON DELETE CASCADE)
 */
const deleteEvent = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!(await loadManageableEvent(id, req, res))) return undefined;

    await Event.deleteById(id);
    return res.json({ success: true, message: 'Đã xóa sự kiện.' });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/events/:id/showtimes
 */
const createShowtime = async (req, res, next) => {
  try {
    const eventId = parseId(req.params.id);
    if (!(await loadManageableEvent(eventId, req, res))) return undefined;

    const [showtime] = await Showtime.create({ ...req.showtimeData, event_id: eventId });
    return res.status(201).json({ success: true, message: 'Tạo suất diễn thành công.', data: { showtime } });
  } catch (err) {
    return next(err);
  }
};

/**
 * PATCH /api/showtimes/:id
 */
const updateShowtime = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const current = await loadManageableShowtime(id, req, res);
    if (!current) return undefined;

    const startsAt = new Date(req.showtimeData.starts_at ?? current.starts_at);
    const endsAt = req.showtimeData.ends_at !== undefined ? req.showtimeData.ends_at : current.ends_at;
    if (endsAt && new Date(endsAt) <= startsAt) {
      return res.status(400).json({ success: false, message: 'Thời gian kết thúc phải sau thời gian bắt đầu.' });
    }

    const [showtime] = await Showtime.updateById(id, req.showtimeData);
    return res.json({ success: true, message: 'Cập nhật suất diễn thành công.', data: { showtime } });
  } catch (err) {
    return next(err);
  }
};

/**
 * DELETE /api/showtimes/:id
 */
const deleteShowtime = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!(await loadManageableShowtime(id, req, res))) return undefined;

    await Showtime.deleteById(id);
    return res.json({ success: true, message: 'Đã xóa suất diễn.' });
  } catch (err) {
    return next(err);
  }
};

// ─── SCRUM-84: Seat hold ─────────────────────────────────────────────────────

/**
 * Lấy suất diễn có thể bán vé: tồn tại, thuộc event đã publish, chưa bắt đầu.
 */
const loadBookableShowtime = async (showtimeId, res) => {
  const showtime = showtimeId ? await Showtime.findById(showtimeId) : null;
  const event = showtime ? await Event.findById(showtime.event_id) : null;
  // S-07: suất nháp không hiện với người mua
  if (!showtime || !event || event.status !== 'published' || showtime.status === 'draft') {
    notFound(res, 'Không tìm thấy suất diễn.');
    return null;
  }
  if (new Date(showtime.starts_at) <= new Date()) {
    res.status(400).json({ success: false, message: 'Suất diễn đã bắt đầu, không thể giữ chỗ.' });
    return null;
  }
  return showtime;
};

/**
 * GET /api/showtimes/:id/availability
 */
const getAvailability = async (req, res, next) => {
  try {
    const showtime = await loadBookableShowtime(parseId(req.params.id), res);
    if (!showtime) return undefined;

    const availability = await seatHoldService.getAvailability({
      showtimeId: showtime.id,
      capacity: showtime.capacity,
    });
    return res.json({ success: true, data: availability });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/showtimes/:id/holds  { quantity }
 */
const holdSeats = async (req, res, next) => {
  try {
    const showtime = await loadBookableShowtime(parseId(req.params.id), res);
    if (!showtime) return undefined;

    const hold = await seatHoldService.holdSeats({
      showtimeId: showtime.id,
      userId: req.user.userId,
      quantity: req.body.quantity,
      capacity: showtime.capacity,
    });
    return res.status(201).json({
      success: true,
      message: `Đã giữ ${hold.quantity} chỗ. Vui lòng thanh toán trước khi hết thời gian giữ chỗ.`,
      data: { hold },
    });
  } catch (err) {
    if (err instanceof seatHoldService.SeatHoldError) {
      return res.status(409).json({ success: false, message: err.message, data: err.details });
    }
    return next(err);
  }
};

/**
 * DELETE /api/showtimes/holds/:holdId
 */
const releaseHold = async (req, res, next) => {
  try {
    const result = await seatHoldService.releaseHold({ holdId: req.params.holdId, userId: req.user.userId });
    if (result === 'not_found') {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lượt giữ chỗ (có thể đã hết hạn).' });
    }
    if (result === 'forbidden') {
      req.denyReason = `User ${req.user.userId} hủy hold của người khác`;
      return res.status(403).json({ success: false, message: 'Bạn không thể hủy lượt giữ chỗ của người khác.' });
    }
    return res.json({ success: true, message: 'Đã hủy giữ chỗ.' });
  } catch (err) {
    return next(err);
  }
};

// ─── S-05 / T-12: Seat map import ────────────────────────────────────────────

/**
 * PUT /api/showtimes/:id/seat-map  { seats: [{ row, number, category }] }
 * Thay toàn bộ sơ đồ ghế của suất diễn (organizer sở hữu event hoặc admin).
 */
const importSeatMap = async (req, res, next) => {
  try {
    const showtime = await loadManageableShowtime(parseId(req.params.id), req, res);
    if (!showtime) return undefined;

    const result = await seatMapService.importSeatMap({ showtimeId: showtime.id, seats: req.seatMap });
    return res.json({
      success: true,
      message: result.replacedSeatCount > 0
        ? `Đã thay sơ đồ cũ (${result.replacedSeatCount} ghế) bằng ${result.seatCount} ghế mới.`
        : `Đã nạp ${result.seatCount} ghế.`,
      data: result,
    });
  } catch (err) {
    if (err instanceof seatMapService.SeatMapError) {
      const status = err.code === 'SHOWTIME_NOT_FOUND' ? 404 : 409;
      return res.status(status).json({ success: false, code: err.code, message: err.message });
    }
    return next(err);
  }
};

// ─── S-07 / T-15: Mở bán / đóng bán ──────────────────────────────────────────

/**
 * GET /api/events/:id/showtimes — organizer/admin xem mọi suất (kể cả nháp) kèm số ghế
 */
const listEventShowtimes = async (req, res, next) => {
  try {
    const eventId = parseId(req.params.id);
    if (!(await loadManageableEvent(eventId, req, res))) return undefined;

    const showtimes = await Showtime.listByEventWithSeatMap(eventId);
    return res.json({ success: true, data: { showtimes } });
  } catch (err) {
    return next(err);
  }
};

const changeSaleStatus = (action) => async (req, res, next) => {
  try {
    const showtime = await loadManageableShowtime(parseId(req.params.id), req, res);
    if (!showtime) return undefined;

    const result = await showtimeSaleService.changeStatus({
      showtimeId: showtime.id, action, userId: req.user.userId,
    });
    return res.json({
      success: true,
      message: action === 'open' ? 'Đã mở bán suất diễn.' : 'Đã đóng bán suất diễn.',
      data: result,
    });
  } catch (err) {
    if (err instanceof showtimeSaleService.ShowtimeSaleError) {
      const status = err.code === 'SHOWTIME_NOT_FOUND' ? 404 : 409;
      return res.status(status).json({ success: false, code: err.code, message: err.message });
    }
    return next(err);
  }
};

/** POST /api/showtimes/:id/open-sales */
const openSales = changeSaleStatus('open');

/** POST /api/showtimes/:id/close-sales */
const closeSales = changeSaleStatus('close');

/**
 * GET /api/showtimes/:id/status-log — nhật ký đổi trạng thái (organizer sở hữu/admin)
 */
const getStatusLog = async (req, res, next) => {
  try {
    const showtime = await loadManageableShowtime(parseId(req.params.id), req, res);
    if (!showtime) return undefined;

    const logs = await showtimeSaleService.listStatusLog(showtime.id);
    return res.json({ success: true, data: { logs } });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listEventShowtimes,
  openSales,
  closeSales,
  getStatusLog,
  importSeatMap,
  listEvents,
  getEvent,
  listMyEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  createShowtime,
  updateShowtime,
  deleteShowtime,
  getAvailability,
  holdSeats,
  releaseHold,
};
