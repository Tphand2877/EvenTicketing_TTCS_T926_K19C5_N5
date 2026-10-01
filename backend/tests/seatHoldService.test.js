/**
 * SCRUM-84 (spike) - Giữ chỗ có thời hạn: unit test cho seatHoldService
 */

const seatHoldService = require('../src/services/seatHoldService');

const TTL_MS = seatHoldService.DEFAULT_TTL_SECONDS * 1000;
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);

describe('seatHoldService (SCRUM-84)', () => {
  beforeEach(() => {
    delete process.env.SEAT_HOLD_TTL_SECONDS;
    seatHoldService._reset();
  });

  test('Giữ chỗ trừ vào số chỗ còn trống và trả về thời điểm hết hạn', () => {
    const hold = seatHoldService.holdSeats({ showtimeId: 1, userId: 10, quantity: 2, capacity: 5, now: NOW });

    expect(hold.quantity).toBe(2);
    expect(hold.expiresAt).toBe(new Date(NOW + TTL_MS).toISOString());
    expect(seatHoldService.getAvailability({ showtimeId: 1, capacity: 5, now: NOW }))
      .toEqual({ capacity: 5, held: 2, available: 3 });
  });

  test('Không cho giữ vượt quá số chỗ còn trống (chống bán vượt)', () => {
    seatHoldService.holdSeats({ showtimeId: 1, userId: 10, quantity: 2, capacity: 3, now: NOW });

    expect(() =>
      seatHoldService.holdSeats({ showtimeId: 1, userId: 11, quantity: 2, capacity: 3, now: NOW })
    ).toThrow(seatHoldService.SeatHoldError);

    try {
      seatHoldService.holdSeats({ showtimeId: 1, userId: 11, quantity: 2, capacity: 3, now: NOW });
    } catch (err) {
      expect(err.code).toBe('INSUFFICIENT_SEATS');
      expect(err.details.available).toBe(1);
    }
  });

  test('Hold hết hạn tự động trả chỗ lại', () => {
    seatHoldService.holdSeats({ showtimeId: 1, userId: 10, quantity: 3, capacity: 3, now: NOW });

    const afterExpiry = NOW + TTL_MS;
    expect(seatHoldService.getAvailability({ showtimeId: 1, capacity: 3, now: afterExpiry }).available).toBe(3);
    expect(() =>
      seatHoldService.holdSeats({ showtimeId: 1, userId: 11, quantity: 3, capacity: 3, now: afterExpiry })
    ).not.toThrow();
  });

  test('Mỗi user chỉ có 1 hold / suất diễn: giữ lại sẽ thay thế hold cũ', () => {
    const first = seatHoldService.holdSeats({ showtimeId: 1, userId: 10, quantity: 2, capacity: 3, now: NOW });
    // Đổi từ 2 lên 3 chỗ vẫn hợp lệ vì 2 chỗ cũ của chính user được trả lại trước
    const second = seatHoldService.holdSeats({ showtimeId: 1, userId: 10, quantity: 3, capacity: 3, now: NOW + 1000 });

    expect(second.id).not.toBe(first.id);
    expect(seatHoldService.getAvailability({ showtimeId: 1, capacity: 3, now: NOW + 1000 }).held).toBe(3);
    expect(seatHoldService.releaseHold({ holdId: first.id, userId: 10, now: NOW + 1000 })).toBe('not_found');
  });

  test('Các suất diễn khác nhau không ảnh hưởng nhau', () => {
    seatHoldService.holdSeats({ showtimeId: 1, userId: 10, quantity: 3, capacity: 3, now: NOW });
    expect(seatHoldService.getAvailability({ showtimeId: 2, capacity: 3, now: NOW }).available).toBe(3);
  });

  test('Chỉ chủ hold được hủy', () => {
    const hold = seatHoldService.holdSeats({ showtimeId: 1, userId: 10, quantity: 1, capacity: 3, now: NOW });

    expect(seatHoldService.releaseHold({ holdId: hold.id, userId: 99, now: NOW })).toBe('forbidden');
    expect(seatHoldService.releaseHold({ holdId: hold.id, userId: 10, now: NOW })).toBe('released');
    expect(seatHoldService.getAvailability({ showtimeId: 1, capacity: 3, now: NOW }).available).toBe(3);
  });

  test('TTL đọc từ biến môi trường SEAT_HOLD_TTL_SECONDS', () => {
    process.env.SEAT_HOLD_TTL_SECONDS = '60';
    const hold = seatHoldService.holdSeats({ showtimeId: 1, userId: 10, quantity: 1, capacity: 3, now: NOW });
    expect(hold.expiresAt).toBe(new Date(NOW + 60 * 1000).toISOString());
  });
});
