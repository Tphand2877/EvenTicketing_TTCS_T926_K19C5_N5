const seatSpecificHoldService = require('../services/seatSpecificHoldService');

const parseShowtimeId = (value) => {
  if (!/^[1-9]\d{0,9}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
};

const sendError = (error, req, res, next) => {
  if (error instanceof seatSpecificHoldService.SeatSpecificHoldError) {
    if (error.status === 403) req.denyReason = 'Người dùng yêu cầu hủy ghế trong lượt giữ của tài khoản khác.';
    return res.status(error.status).json({ success: false, message: error.message });
  }
  return next(error);
};

const getServerTime = async (req, res, next) => {
  const showtimeId = parseShowtimeId(req.params.id);
  if (!showtimeId) return res.status(404).json({ success: false, message: 'Không tìm thấy suất diễn.' });
  try {
    const data = await seatSpecificHoldService.getServerTime(showtimeId);
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(error, req, res, next);
  }
};

const getCurrentHold = async (req, res, next) => {
  const showtimeId = parseShowtimeId(req.params.id);
  if (!showtimeId) return res.status(404).json({ success: false, message: 'Không tìm thấy suất diễn.' });
  try {
    const data = await seatSpecificHoldService.getCurrentHold({
      showtimeId,
      userId: req.user.userId,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(error, req, res, next);
  }
};

const holdSeats = async (req, res, next) => {
  const showtimeId = parseShowtimeId(req.params.id);
  if (!showtimeId) return res.status(404).json({ success: false, message: 'Không tìm thấy suất diễn.' });
  try {
    const result = await seatSpecificHoldService.holdSeats({
      showtimeId,
      userId: req.user.userId,
      seatIds: req.body.seatIds,
    });
    return res.status(result.created ? 201 : 200).json({
      success: true,
      message: `Đã giữ ${result.hold.quantity} ghế.`,
      data: { hold: result.hold },
    });
  } catch (error) {
    return sendError(error, req, res, next);
  }
};

const releaseSeat = async (req, res, next) => {
  const showtimeId = parseShowtimeId(req.params.id);
  if (!showtimeId) return res.status(404).json({ success: false, message: 'Không tìm thấy suất diễn.' });
  try {
    const result = await seatSpecificHoldService.releaseSeat({
      showtimeId,
      holdId: req.params.holdId,
      seatId: req.seatId,
      userId: req.user.userId,
    });
    if (result.status === 'not_found') {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ghế đang giữ (có thể đã hết hạn).' });
    }
    if (result.status === 'forbidden') {
      req.denyReason = 'Người dùng yêu cầu hủy ghế trong lượt giữ của tài khoản khác.';
      return res.status(403).json({ success: false, message: 'Bạn không thể hủy ghế trong lượt giữ của người khác.' });
    }
    return res.json({ success: true, data: { hold: result.hold } });
  } catch (error) {
    return sendError(error, req, res, next);
  }
};

module.exports = { getServerTime, getCurrentHold, holdSeats, releaseSeat };
