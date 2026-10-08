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

  test('Trả tối đa 10 lỗi', async () => {
    const res = await upload({ seats: Array.from({ length: 30 }, () => ({ row: 'A' })) });
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(10);
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
