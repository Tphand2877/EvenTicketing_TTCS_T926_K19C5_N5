/**
 * SCRUM-84 (spike) - Giữ chỗ có thời hạn
 *
 * Khi buyer chọn vé, số chỗ được "giữ" tạm trong TTL (mặc định 10 phút).
 * Trong thời gian đó các chỗ này không được tính là còn trống cho người khác.
 * Hết hạn mà chưa thanh toán -> chỗ tự động được trả lại.
 *
 * Kết luận spike:
 *  - Bản này lưu hold trong bộ nhớ của tiến trình Node. Vì Node xử lý tuần tự
 *    trên một luồng và các hàm ở đây đều đồng bộ, việc "kiểm tra còn chỗ rồi giữ"
 *    là nguyên tử trong MỘT instance -> không bán vượt sức chứa.
 *  - Khi chạy nhiều instance backend hoặc restart server, hold sẽ không được chia sẻ/mất.
 *    Lúc đó cần chuyển store sang Redis (SET NX + EXPIRE) hoặc bảng seat_holds
 *    trong PostgreSQL với SELECT ... FOR UPDATE. API của service giữ nguyên.
 *  - Hold hết hạn được dọn "lười" (lazy) mỗi khi có thao tác, không cần cron job.
 */

const crypto = require('crypto');

const DEFAULT_TTL_SECONDS = 600; // 10 phút

/** @type {Map<string, { id: string, showtimeId: number, userId: number, quantity: number, expiresAt: number }>} */
const holds = new Map();

const getTtlMs = () => {
  const seconds = parseInt(process.env.SEAT_HOLD_TTL_SECONDS, 10);
  return (Number.isInteger(seconds) && seconds > 0 ? seconds : DEFAULT_TTL_SECONDS) * 1000;
};

const purgeExpired = (now) => {
  for (const [id, hold] of holds) {
    if (hold.expiresAt <= now) holds.delete(id);
  }
};

const findUserHold = (showtimeId, userId) => {
  for (const hold of holds.values()) {
    if (hold.showtimeId === showtimeId && hold.userId === userId) return hold;
  }
  return null;
};

const heldQuantity = (showtimeId, excludeHoldId = null) => {
  let total = 0;
  for (const hold of holds.values()) {
    if (hold.showtimeId === showtimeId && hold.id !== excludeHoldId) total += hold.quantity;
  }
  return total;
};

const toPublicHold = (hold) => ({
  id: hold.id,
  showtimeId: hold.showtimeId,
  quantity: hold.quantity,
  expiresAt: new Date(hold.expiresAt).toISOString(),
});

class SeatHoldError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

/**
 * Số chỗ còn trống của một suất diễn (đã trừ các hold còn hiệu lực)
 */
const getAvailability = ({ showtimeId, capacity, now = Date.now() }) => {
  purgeExpired(now);
  const held = heldQuantity(showtimeId);
  return { capacity, held, available: Math.max(capacity - held, 0) };
};

/**
 * Giữ `quantity` chỗ cho user. Mỗi user chỉ có 1 hold / suất diễn:
 * giữ lại lần nữa sẽ thay thế hold cũ (và gia hạn thời gian).
 * @throws {SeatHoldError} INSUFFICIENT_SEATS nếu không đủ chỗ
 */
const holdSeats = ({ showtimeId, userId, quantity, capacity, now = Date.now() }) => {
  purgeExpired(now);

  const existing = findUserHold(showtimeId, userId);
  const available = capacity - heldQuantity(showtimeId, existing?.id);

  if (quantity > available) {
    throw new SeatHoldError('INSUFFICIENT_SEATS', `Chỉ còn ${Math.max(available, 0)} chỗ trống.`, {
      available: Math.max(available, 0),
    });
  }

  if (existing) holds.delete(existing.id);

  const hold = {
    id: crypto.randomUUID(),
    showtimeId,
    userId,
    quantity,
    expiresAt: now + getTtlMs(),
  };
  holds.set(hold.id, hold);

  return toPublicHold(hold);
};

/**
 * Hủy hold. Chỉ chủ hold được hủy.
 * @returns {'released' | 'not_found' | 'forbidden'}
 */
const releaseHold = ({ holdId, userId, now = Date.now() }) => {
  purgeExpired(now);
  const hold = holds.get(holdId);
  if (!hold) return 'not_found';
  if (hold.userId !== userId) return 'forbidden';
  holds.delete(holdId);
  return 'released';
};

/** Chỉ dùng trong test */
const _reset = () => holds.clear();

module.exports = {
  DEFAULT_TTL_SECONDS,
  SeatHoldError,
  getAvailability,
  holdSeats,
  releaseHold,
  _reset,
};
