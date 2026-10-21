const crypto = require('crypto');

/**
 * SCRUM-222 / SCRUM-223 [S-26 / S-27]
 * Chữ ký bảo mật cho mã QR trên vé điện tử.
 * Sử dụng HMAC-SHA256 để chống làm giả hoặc sửa đổi thông tin vé ngoài hệ thống.
 */

const getSecretKey = () => process.env.TICKET_SIGN_SECRET || process.env.JWT_SECRET || 'eventticketing_ticket_secret_key_2026';

/**
 * Tạo chữ ký HMAC cho thông tin vé
 * @param {Object} payload
 * @returns {string} Hex signature
 */
const signTicketPayload = (payload) => {
  const { ticketId, orderId, showtimeId, seatId, seatLabel } = payload;
  const canonicalString = `${ticketId}:${orderId}:${showtimeId}:${seatId}:${seatLabel}`;
  return crypto.createHmac('sha256', getSecretKey()).update(canonicalString).digest('hex');
};

/**
 * Kiểm tra tính hợp lệ của chữ ký vé
 * @param {Object} payload
 * @param {string} signature
 * @returns {boolean}
 */
const verifyTicketSignature = (payload, signature) => {
  if (!signature || typeof signature !== 'string') return false;
  try {
    const expected = signTicketPayload(payload);
    const expectedBuf = Buffer.from(expected, 'hex');
    const signatureBuf = Buffer.from(signature, 'hex');
    if (expectedBuf.length !== signatureBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
};

module.exports = {
  signTicketPayload,
  verifyTicketSignature,
};
