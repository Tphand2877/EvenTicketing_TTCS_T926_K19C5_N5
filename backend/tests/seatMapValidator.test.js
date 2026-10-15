/**
 * S-06 / T-13: Unit tests cho bộ kiểm tra cấu trúc tệp sơ đồ ghế (seatMapValidator).
 */

const {
  validateSeatMapStructure,
  parseJsonWithPosition,
  SEAT_MAP_MAX_SEATS,
  SEAT_MAP_MAX_CATEGORIES,
} = require('../src/utils/seatMapValidator');

describe('S-06 / T-13: seatMapValidator unit tests', () => {
  describe('parseJsonWithPosition', () => {
    test('JSON hợp lệ trả về data và error = null', () => {
      const res = parseJsonWithPosition('{"seats":[{"row":"A","number":1,"category":"VIP"}]}');
      expect(res.error).toBeNull();
      expect(res.data.seats).toHaveLength(1);
    });

    test('AC4: JSON không hợp lệ trả về lỗi định dạng kèm vị trí ký tự', () => {
      const invalidJson = '{\n  "seats": [\n    { "row": "A",\n  }\n}';
      const res = parseJsonWithPosition(invalidJson);
      expect(res.data).toBeNull();
      expect(res.error).toBeDefined();
      expect(res.error.position).toBeDefined();
      expect(typeof res.error.position).toBe('number');
      expect(res.error.message).toMatch(/vị trí ký tự \d+/i);
    });

    test('Chuỗi không phải string trả về nguyên trạng', () => {
      const obj = { seats: [] };
      const res = parseJsonWithPosition(obj);
      expect(res.data).toBe(obj);
      expect(res.error).toBeNull();
    });

    test('NFR: Chuỗi vượt quá 5 MB trả về lỗi kích thước tệp', () => {
      const largeString = 'x'.repeat(5 * 1024 * 1024 + 1);
      const res = parseJsonWithPosition(largeString);
      expect(res.data).toBeNull();
      expect(res.error.message).toContain('5 MB');
    });
  });

  describe('validateSeatMapStructure', () => {
    test('Dữ liệu không phải object hoặc thiếu mảng seats -> trả lỗi', () => {
      expect(validateSeatMapStructure(null).errors[0]).toMatch(/JSON object/);
      expect(validateSeatMapStructure([]).errors[0]).toMatch(/JSON object/);
      expect(validateSeatMapStructure({}).errors[0]).toMatch(/mảng "seats"/);
      expect(validateSeatMapStructure({ seats: [] }).errors[0]).toMatch(/mảng "seats"/);
    });

    test('Vượt quá 10.000 ghế -> trả lỗi', () => {
      const hugeSeats = Array.from({ length: SEAT_MAP_MAX_SEATS + 1 }, (_, i) => ({
        row: 'A', number: i + 1, category: 'VIP',
      }));
      const res = validateSeatMapStructure({ seats: hugeSeats });
      expect(res.isValid).toBe(false);
      expect(res.errors[0]).toContain(`vượt giới hạn ${SEAT_MAP_MAX_SEATS} ghế`);
    });

    test('AC1: Thiếu trường bắt buộc ở từng ghế -> từ chối toàn bộ và chỉ rõ ghế nào thiếu trường nào', () => {
      const res = validateSeatMapStructure({
        seats: [
          { row: 'A', number: 1, category: 'VIP' },
          { number: 2, category: 'VIP' },       // Thiếu row
          { row: 'B', category: 'VIP' },        // Thiếu number
          { row: 'C', number: 3 },              // Thiếu category
          { row: 'D' },                         // Thiếu number & category
        ],
      });
      expect(res.isValid).toBe(false);
      expect(res.errors).toHaveLength(4);
      expect(res.errors[0]).toBe('Ghế #2: thiếu trường bắt buộc "row" (chuỗi 1–10 ký tự).');
      expect(res.errors[1]).toBe('Ghế #3: thiếu trường bắt buộc "number" (số nguyên 1–9999).');
      expect(res.errors[2]).toBe('Ghế #4: thiếu trường bắt buộc "category" (chuỗi 1–100 ký tự).');
      expect(res.errors[3]).toBe('Ghế #5: thiếu trường bắt buộc "number" (số nguyên 1–9999), thiếu trường bắt buộc "category" (chuỗi 1–100 ký tự).');
    });

    test('AC2: Ghế trùng hàng và số -> từ chối và chỉ ra cặp trùng', () => {
      const res = validateSeatMapStructure({
        seats: [
          { row: 'A', number: 1, category: 'VIP' },
          { row: 'A', number: 1, category: 'Thường' },
        ],
      });
      expect(res.isValid).toBe(false);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0]).toBe('Ghế #2: trùng ghế A1 với ghế #1.');
    });

    test('AC3: Tệp có nhiều lỗi -> trả đủ danh sách toàn bộ lỗi trong một lần', () => {
      const seats = Array.from({ length: 25 }, (_, i) => ({
        row: 'A',
        // ghế chẵn thiếu number, ghế lẻ trùng A1
        ...(i % 2 === 0 ? {} : { number: 1, category: 'VIP' }),
      }));
      const res = validateSeatMapStructure({ seats });
      expect(res.isValid).toBe(false);
      expect(res.errors.length).toBeGreaterThan(20);
    });

    test('Vượt quá 50 hạng ghế -> trả lỗi', () => {
      const seats = Array.from({ length: SEAT_MAP_MAX_CATEGORIES + 1 }, (_, i) => ({
        row: 'A', number: i + 1, category: `Hạng ${i}`,
      }));
      const res = validateSeatMapStructure({ seats });
      expect(res.isValid).toBe(false);
      expect(res.errors).toEqual(expect.arrayContaining([expect.stringMatching(/50 hạng/)]));
    });

    test('AC5: Tệp hợp lệ -> trả isValid = true, normalized và summary xem trước lưới ghế', () => {
      const res = validateSeatMapStructure({
        seats: [
          { row: ' A ', number: 1, category: ' VIP ' },
          { row: 'A', number: 2, category: 'VIP' },
          { row: 'B', number: 1, category: 'Thường' },
        ],
      });
      expect(res.isValid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.normalized).toEqual([
        { row: 'A', number: 1, category: 'VIP' },
        { row: 'A', number: 2, category: 'VIP' },
        { row: 'B', number: 1, category: 'Thường' },
      ]);
      expect(res.summary).toEqual({
        totalSeats: 3,
        totalRows: 2,
        rows: ['A', 'B'],
        totalCategories: 2,
        categories: ['VIP', 'Thường'],
      });
    });
  });
});
