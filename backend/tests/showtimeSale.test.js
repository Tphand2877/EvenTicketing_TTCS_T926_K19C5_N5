/**
 * S-07 / T-15 - API mở bán/đóng bán: phân quyền và ánh xạ lỗi.
 * Service được mock; luật chuyển trạng thái thật nằm ở showtimeSale.integration.test.js.
 */

process.env.JWT_SECRET = 'test_secret_key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/models/AuditLog', () => ({ create: jest.fn().mockResolvedValue(1) }));
jest.mock('../src/models/Showtime', () => ({
  findById: jest.fn(async (id) => (id === 1 ? { id: 1, event_id: 10, status: 'draft' } : undefined)),
  listByEventWithSeatMap: jest.fn(async () => [{ id: 1, status: 'draft', seat_count: 120, category_count: 2 }]),
}));
jest.mock('../src/models/Event', () => ({
  findById: jest.fn(async (id) => (id === 10 ? { id: 10, organizer_id: 1, status: 'published' } : undefined)),
}));
jest.mock('../src/services/showtimeSaleService', () => {
  class ShowtimeSaleError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  return { ShowtimeSaleError, changeStatus: jest.fn(), listStatusLog: jest.fn() };
});

const app = require('../src/app');
const showtimeSaleService = require('../src/services/showtimeSaleService');

const tokenFor = (userId, role) => `Bearer ${jwt.sign({ userId, role }, process.env.JWT_SECRET)}`;
const OWNER = tokenFor(1, 'organizer');
const OTHER_ORGANIZER = tokenFor(2, 'organizer');
const ADMIN = tokenFor(3, 'admin');
const BUYER = tokenFor(4, 'buyer');

const post = (path, token = OWNER) => {
  const req = request(app).post(path);
  return token ? req.set('Authorization', token) : req;
};

beforeEach(() => {
  showtimeSaleService.changeStatus.mockReset();
  showtimeSaleService.changeStatus.mockImplementation(async ({ action }) => ({
    showtime: { id: 1, status: action === 'open' ? 'on_sale' : 'closed' },
    log: { id: 1 },
  }));
  showtimeSaleService.listStatusLog.mockReset();
});

describe('S-07: phân quyền', () => {
  test('Chưa đăng nhập → 401; buyer → 403', async () => {
    expect((await post('/api/showtimes/1/open-sales', null)).status).toBe(401);
    expect((await post('/api/showtimes/1/open-sales', BUYER)).status).toBe(403);
    expect((await post('/api/showtimes/1/close-sales', BUYER)).status).toBe(403);
  });

  test('Organizer không sở hữu event → 403, không đổi trạng thái', async () => {
    expect((await post('/api/showtimes/1/open-sales', OTHER_ORGANIZER)).status).toBe(403);
    expect(showtimeSaleService.changeStatus).not.toHaveBeenCalled();
  });

  test('Chủ event và admin đổi được; người thao tác lấy từ token', async () => {
    expect((await post('/api/showtimes/1/open-sales', OWNER)).status).toBe(200);
    expect((await post('/api/showtimes/1/close-sales', ADMIN)).status).toBe(200);
    expect(showtimeSaleService.changeStatus.mock.calls).toEqual([
      [{ showtimeId: 1, action: 'open', userId: 1 }],
      [{ showtimeId: 1, action: 'close', userId: 3 }],
    ]);
  });

  test('Suất không tồn tại → 404', async () => {
    expect((await post('/api/showtimes/999/open-sales')).status).toBe(404);
  });

  test('Danh sách suất và nhật ký chỉ cho chủ event/admin', async () => {
    expect((await request(app).get('/api/events/10/showtimes').set('Authorization', BUYER)).status).toBe(403);
    expect((await request(app).get('/api/events/10/showtimes').set('Authorization', OTHER_ORGANIZER)).status).toBe(403);
    expect((await request(app).get('/api/showtimes/1/status-log').set('Authorization', OTHER_ORGANIZER)).status).toBe(403);
  });
});

describe('S-07: kết quả và lỗi', () => {
  test('Mở bán / đóng bán trả thông báo và trạng thái mới', async () => {
    const open = await post('/api/showtimes/1/open-sales');
    expect(open.body).toMatchObject({ message: 'Đã mở bán suất diễn.', data: { showtime: { status: 'on_sale' } } });
    const close = await post('/api/showtimes/1/close-sales');
    expect(close.body).toMatchObject({ message: 'Đã đóng bán suất diễn.', data: { showtime: { status: 'closed' } } });
  });

  test.each([
    ['NO_SEAT_MAP', 'Suất diễn chưa có sơ đồ ghế. Hãy nạp sơ đồ ghế trước khi mở bán.'],
    ['ALREADY_IN_STATUS', 'Suất diễn đã ở trạng thái đang bán.'],
    ['INVALID_TRANSITION', 'Không thể đóng bán suất diễn đang ở trạng thái nháp.'],
    ['EVENT_NOT_PUBLISHED', 'Sự kiện chưa được công khai.'],
    ['SHOWTIME_STARTED', 'Suất diễn đã bắt đầu, không thể mở bán.'],
  ])('%s → 409 kèm lý do', async (code, message) => {
    showtimeSaleService.changeStatus.mockRejectedValue(new showtimeSaleService.ShowtimeSaleError(code, message));
    const res = await post('/api/showtimes/1/open-sales');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, code, message });
  });

  test('Lỗi không lường trước → 500, không lộ chi tiết', async () => {
    showtimeSaleService.changeStatus.mockRejectedValue(new Error('db secret detail'));
    const res = await post('/api/showtimes/1/open-sales');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  test('Danh sách suất cho organizer kèm số ghế; nhật ký trả về cho chủ event', async () => {
    const list = await request(app).get('/api/events/10/showtimes').set('Authorization', OWNER);
    expect(list.body.data.showtimes[0]).toMatchObject({ status: 'draft', seat_count: 120 });

    showtimeSaleService.listStatusLog.mockResolvedValue([{ id: 1, from_status: 'draft', to_status: 'on_sale', changed_by: 1 }]);
    const log = await request(app).get('/api/showtimes/1/status-log').set('Authorization', OWNER);
    expect(log.body.data.logs).toHaveLength(1);
  });
});
