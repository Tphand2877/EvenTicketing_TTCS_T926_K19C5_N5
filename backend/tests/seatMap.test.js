/**
 * S-05 / T-12 - API nạp sơ đồ ghế: validate tệp, phân quyền, ánh xạ lỗi.
 * Service được mock; hành vi giao dịch thật nằm ở seatMap.integration.test.js.
 */

process.env.JWT_SECRET = 'test_secret_key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/models/AuditLog', () => ({ create: jest.fn().mockResolvedValue(1) }));
jest.mock('../src/models/Showtime', () => ({
  findById: jest.fn(async (id) => (id === 1 ? { id: 1, event_id: 10, capacity: 100 } : undefined)),
}));
jest.mock('../src/models/Event', () => ({
  findById: jest.fn(async (id) => (id === 10 ? { id: 10, organizer_id: 1, status: 'published' } : undefined)),
}));
jest.mock('../src/services/seatMapService', () => {
  class SeatMapError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  return { SeatMapError, importSeatMap: jest.fn() };
});

const app = require('../src/app');
const seatMapService = require('../src/services/seatMapService');

const tokenFor = (userId, role) => `Bearer ${jwt.sign({ userId, role }, process.env.JWT_SECRET)}`;
const OWNER = tokenFor(1, 'organizer');
const OTHER_ORGANIZER = tokenFor(2, 'organizer');
const ADMIN = tokenFor(3, 'admin');
const BUYER = tokenFor(4, 'buyer');

const upload = (body, token = OWNER, id = 1) => {
  const req = request(app).put(`/api/showtimes/${id}/seat-map`).send(body);
  return token ? req.set('Authorization', token) : req;
};

const seats = (n, category = 'Thường') =>
  Array.from({ length: n }, (_, i) => ({ row: String.fromCharCode(65 + Math.floor(i / 100)), number: (i % 100) + 1, category }));

beforeEach(() => {
  seatMapService.importSeatMap.mockReset();
  seatMapService.importSeatMap.mockResolvedValue({
    seatCount: 2, replacedSeatCount: 0, categories: [], createdCategories: [],
  });
});

describe('S-05: validate tệp sơ đồ ghế', () => {
  test('Thiếu mảng seats hoặc mảng rỗng → 400', async () => {
    expect((await upload({})).status).toBe(400);
    expect((await upload({ seats: [] })).status).toBe(400);
    expect(seatMapService.importSeatMap).not.toHaveBeenCalled();
  });

  test('Ghế sai định dạng → 400, lỗi chỉ rõ vị trí ghế', async () => {
    const res = await upload({ seats: [
      { row: 'A', number: 1, category: 'VIP' },
      { row: '', number: 0, category: '' },
      'không phải object',
    ] });
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(2);
    expect(res.body.errors[0]).toMatch(/^Ghế #2: .*"row".*"number".*"category"/);
    expect(res.body.errors[1]).toMatch(/^Ghế #3:/);
  });

  test('Ghế trùng (cùng hàng, cùng số) → 400, nêu cả hai vị trí', async () => {
    const res = await upload({ seats: [
      { row: 'A', number: 1, category: 'VIP' },
      { row: 'A', number: 1, category: 'Thường' },
    ] });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toBe('Ghế #2: trùng ghế A1 với ghế #1.');
  });

  test('S-06 / AC1: Thiếu trường bắt buộc ở một ghế → từ chối toàn bộ và chỉ rõ ghế nào thiếu trường nào', async () => {
    const res = await upload({ seats: [
      { row: 'A', number: 1, category: 'VIP' },
      { number: 2, category: 'VIP' },
      { row: 'B', category: 'VIP' },
      { row: 'C', number: 3 },
    ] });
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(3);
    expect(res.body.errors[0]).toBe('Ghế #2: thiếu trường bắt buộc "row" (chuỗi 1–10 ký tự).');
    expect(res.body.errors[1]).toBe('Ghế #3: thiếu trường bắt buộc "number" (số nguyên 1–9999).');
    expect(res.body.errors[2]).toBe('Ghế #4: thiếu trường bắt buộc "category" (chuỗi 1–100 ký tự).');
    expect(seatMapService.importSeatMap).not.toHaveBeenCalled();
  });

  test('S-06 / AC3: Trả đủ toàn bộ danh sách lỗi trong một lần (không bị giới hạn 10 lỗi)', async () => {
    const res = await upload({ seats: Array.from({ length: 30 }, () => ({ row: 'A' })) });
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(30);
  });

  test('S-06 / AC4: Tệp không phải JSON hợp lệ → báo lỗi định dạng kèm vị trí ký tự, không hiện lỗi 500', async () => {
    const res = await request(app)
      .put('/api/showtimes/1/seat-map')
      .set('Authorization', OWNER)
      .set('Content-Type', 'application/json')
      .send('{ "seats": [ invalid json }');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/JSON/i);
    expect(res.body.message).toMatch(/position \d+/i);
  });

  test('S-06 / AC5: API kiểm tra xem trước sơ đồ ghế (POST /api/showtimes/:id/seat-map/validate) trả về lưới ghế hợp lệ trước khi nạp', async () => {
    const res = await request(app)
      .post('/api/showtimes/1/seat-map/validate')
      .set('Authorization', OWNER)
      .send({ seats: [
        { row: 'A', number: 1, category: 'VIP' },
        { row: 'A', number: 2, category: 'VIP' },
        { row: 'B', number: 1, category: 'Thường' },
      ] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isValid).toBe(true);
    expect(res.body.data.seatCount).toBe(3);
    expect(res.body.data.summary).toMatchObject({
      totalSeats: 3,
      totalRows: 2,
      rows: ['A', 'B'],
      categories: ['VIP', 'Thường'],
    });
    expect(seatMapService.importSeatMap).not.toHaveBeenCalled();
  });

  test('Vượt 10.000 ghế → 400', async () => {
    const res = await upload({ seats: Array.from({ length: 10001 }, (_, i) => ({ row: 'A', number: i + 1, category: 'X' })) });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/vượt giới hạn 10000 ghế/);
  });

  test('Vượt 50 hạng ghế → 400', async () => {
    const res = await upload({ seats: Array.from({ length: 51 }, (_, i) => ({ row: 'A', number: i + 1, category: `H${i}` })) });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/50 hạng/);
  });

  test('Tệp hợp lệ: trim khoảng trắng rồi chuyển cho service; tệp 2.000 ghế không bị giới hạn kích thước body', async () => {
    await upload({ seats: [{ row: ' A ', number: 1, category: ' VIP ' }] });
    expect(seatMapService.importSeatMap).toHaveBeenCalledWith({
      showtimeId: 1, seats: [{ row: 'A', number: 1, category: 'VIP' }],
    });

    const res = await upload({ seats: seats(2000, 'Hạng phổ thông dài tên') });
    expect(res.status).toBe(200);
    expect(seatMapService.importSeatMap.mock.calls[1][0].seats).toHaveLength(2000);
  });
});

describe('S-05: phân quyền', () => {
  const body = { seats: [{ row: 'A', number: 1, category: 'VIP' }] };

  test('Chưa đăng nhập → 401; buyer → 403', async () => {
    expect((await upload(body, null)).status).toBe(401);
    expect((await upload(body, BUYER)).status).toBe(403);
  });

  test('Organizer không sở hữu event → 403', async () => {
    expect((await upload(body, OTHER_ORGANIZER)).status).toBe(403);
    expect(seatMapService.importSeatMap).not.toHaveBeenCalled();
  });

  test('Chủ event và admin nạp được', async () => {
    expect((await upload(body, OWNER)).status).toBe(200);
    expect((await upload(body, ADMIN)).status).toBe(200);
  });

  test('Suất diễn không tồn tại → 404', async () => {
    expect((await upload(body, OWNER, 999)).status).toBe(404);
  });
});

describe('S-05: kết quả và lỗi từ service', () => {
  const body = { seats: [{ row: 'A', number: 1, category: 'VIP' }] };

  test('Thông báo khi thay sơ đồ cũ', async () => {
    seatMapService.importSeatMap.mockResolvedValue({
      seatCount: 1, replacedSeatCount: 50, categories: [{ name: 'VIP', seatCount: 1 }], createdCategories: [],
    });
    const res = await upload(body);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Đã thay sơ đồ cũ (50 ghế) bằng 1 ghế mới.');
  });

  test('AC3: sơ đồ bị khoá (đã bán/đang giữ) → 409 kèm lý do', async () => {
    seatMapService.importSeatMap.mockRejectedValue(
      new seatMapService.SeatMapError('SEAT_MAP_LOCKED', 'Không thể thay sơ đồ ghế: Suất diễn đang có người giữ chỗ.')
    );
    const res = await upload(body);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'SEAT_MAP_LOCKED', message: expect.stringContaining('đang có người giữ chỗ') });
  });

  test('Lỗi DB không lường trước → 500, không lộ chi tiết', async () => {
    seatMapService.importSeatMap.mockRejectedValue(new Error('insert into "seats" ... secret detail'));
    const res = await upload(body);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret detail');
  });
});
