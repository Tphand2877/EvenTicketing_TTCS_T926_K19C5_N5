const { ScanRequestError } = require('../services/gateScanService');
const { TicketAdmissionError } = require('../services/ticketAdmissionService');

// Thông báo cố định cho từng mã; không trả lỗi SQL hay dữ liệu đầu vào (S-31)
const RESULT_MESSAGES = {
  CHECKED_IN: 'Vé hợp lệ. Mời vào.',
  ALREADY_CHECKED_IN: 'Vé đã được dùng để vào trước đó.',
  ADMITTED_WITH_NOTE: 'Đã cho vào có ghi chú.',
  OVERRIDE_ALREADY_RECORDED: 'Lượt cho vào này đã được ghi trước đó, không cho vào thêm.',
  INVALID_QR: 'Mã QR không hợp lệ: không phải vé do hệ thống phát hành hoặc đã bị sửa.',
  TICKET_NOT_FOUND: 'Không tìm thấy vé.',
  TICKET_VOID: 'Vé đã bị huỷ.',
  WRONG_SHOWTIME: 'Vé không thuộc suất diễn đang soát.',
};

const ERROR_MESSAGES = {
  SHOWTIME_REQUIRED: 'Chọn suất diễn trước khi quét.',
  GATE_REQUIRED: 'Chọn cổng trước khi quét.',
  SHOWTIME_INVALID: 'Suất diễn không tồn tại hoặc chưa mở.',
  GATE_INVALID: 'Cổng không thuộc sự kiện này.',
  SCANNER_FORBIDDEN: 'Tài khoản không có quyền soát vé hoặc đã bị khoá.',
  OVERRIDE_FORBIDDEN: 'Chỉ trưởng ca được cho vào có ghi chú.',
  GATES_INVALID: 'Danh sách cổng phải có 1–20 tên khác nhau, mỗi tên tối đa 100 ký tự.',
  INVALID_SCAN_CONTEXT: 'Dữ liệu quét không hợp lệ.',
  INVALID_OVERRIDE: 'Cần nhập lý do (tối đa 500 ký tự).',
  TICKET_NOT_CHECKED_IN: 'Vé chưa vào lần nào, hãy quét bình thường.',
  OVERRIDE_REQUEST_CONFLICT: 'Yêu cầu xác nhận đã được dùng với nội dung khác.',
  STAFF_NAME_REQUIRED: 'Tài khoản cần có họ tên để xác nhận cho vào.',
  STAFF_NOT_ACTIVE: 'Tài khoản không có quyền soát vé hoặc đã bị khoá.',
  UNAUTHORIZED_TICKET_CONTEXT: 'Không xác thực được vé.',
};

const sendError = (error, res, scope) => {
  const known = error instanceof ScanRequestError || error instanceof TicketAdmissionError || ERROR_MESSAGES[error?.code];
  if (known && ERROR_MESSAGES[error.code]) {
    return res.status(error.status || 400).json({ success: false, code: error.code, message: ERROR_MESSAGES[error.code] });
  }
  console.error(`[${scope}] Request failed.`);
  return res.status(500).json({ success: false, message: 'Không xử lý được yêu cầu. Vui lòng thử lại.' });
};

const sendResult = (res, result) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ success: true, data: { result: { ...result, message: RESULT_MESSAGES[result.code] } } });
};

const createGateScanController = ({ service }) => ({
  async listShowtimes(_req, res) {
    try {
      res.set('Cache-Control', 'no-store');
      return res.json({ success: true, data: { showtimes: await service.listShowtimes() } });
    } catch (error) {
      return sendError(error, res, 'Scanner');
    }
  },

  async scan(req, res) {
    try {
      const { qrCode, showtimeId, gate } = req.body || {};
      return sendResult(res, await service.scan({ actorId: req.user.userId, qrCode, showtimeId, gate }));
    } catch (error) {
      return sendError(error, res, 'Scanner');
    }
  },

  async admitWithNote(req, res) {
    try {
      const { qrCode, showtimeId, gate, reason, requestId } = req.body || {};
      return sendResult(res, await service.admitWithNote({ actorId: req.user.userId, qrCode, showtimeId, gate, reason, requestId }));
    } catch (error) {
      return sendError(error, res, 'Scanner');
    }
  },
});

module.exports = { ERROR_MESSAGES, RESULT_MESSAGES, createGateScanController, sendError };
