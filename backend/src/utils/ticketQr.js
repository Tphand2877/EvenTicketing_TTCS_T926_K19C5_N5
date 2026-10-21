const crypto = require('crypto');

/**
 * S-26: nội dung QR trên vé = "ET1.<mã vé>.<chữ ký>".
 * Chữ ký là HMAC-SHA256 bằng khoá chỉ có trên server, nên ngoài hệ thống không tạo được QR hợp lệ,
 * sửa một ký tự của mã vé cũng làm chữ ký sai. QR không chứa thông tin cá nhân hay giá vé.
 */
const VERSION = 'ET1';
const TICKET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MIN_SECRET_LENGTH = 32;

class TicketQrConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TicketQrConfigError';
    this.code = 'TICKET_QR_NOT_CONFIGURED';
  }
}

/**
 * TICKET_QR_SECRET là khoá riêng cho QR. Nếu chưa đặt thì dẫn xuất từ JWT_SECRET (đã bắt buộc
 * khi chạy) để mỗi môi trường có khoá bí mật riêng. Không có khoá mặc định viết sẵn trong code.
 */
const resolveKey = (env = process.env) => {
  if (env.TICKET_QR_SECRET) {
    if (env.TICKET_QR_SECRET.length < MIN_SECRET_LENGTH) {
      throw new TicketQrConfigError(`TICKET_QR_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`);
    }
    return Buffer.from(env.TICKET_QR_SECRET, 'utf8');
  }
  if (env.JWT_SECRET) {
    return crypto.createHmac('sha256', env.JWT_SECRET).update('eventticketing:ticket-qr:v1').digest();
  }
  throw new TicketQrConfigError('TICKET_QR_SECRET or JWT_SECRET is required to sign ticket QR codes.');
};

const signatureFor = (ticketId, env) => crypto
  .createHmac('sha256', resolveKey(env))
  .update(`${VERSION}.${ticketId}`)
  .digest('base64url');

const signTicketCode = (ticketId, env = process.env) => {
  if (!TICKET_ID_PATTERN.test(ticketId || '')) throw new TypeError('A canonical ticket ID is required.');
  return `${VERSION}.${ticketId}.${signatureFor(ticketId, env)}`;
};

/**
 * Trả { valid: true, ticketId } hoặc { valid: false, reason }.
 * Chỉ khi chữ ký đúng mới trả mã vé, nên phía gọi không bao giờ tra DB bằng dữ liệu chưa xác thực.
 */
const verifyTicketCode = (code, env = process.env) => {
  if (typeof code !== 'string' || code.length > 200) return { valid: false, reason: 'MALFORMED' };
  const parts = code.trim().split('.');
  if (parts.length !== 3) return { valid: false, reason: 'MALFORMED' };
  const [version, ticketId, signature] = parts;
  if (version !== VERSION) return { valid: false, reason: 'UNSUPPORTED_VERSION' };
  if (!TICKET_ID_PATTERN.test(ticketId) || !SIGNATURE_PATTERN.test(signature)) {
    return { valid: false, reason: 'MALFORMED' };
  }
  const expected = Buffer.from(signatureFor(ticketId, env), 'base64url');
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return { valid: false, reason: 'BAD_SIGNATURE' };
  }
  return { valid: true, ticketId };
};

module.exports = { TicketQrConfigError, VERSION, signTicketCode, verifyTicketCode };
