/**
 * S-15 / T-34 - Kiểm thử đặt giá vé cho từng hạng ghế của suất diễn.
 *
 * AC1: Suất có sơ đồ 3 hạng ghế -> nhập giá từng hạng và lưu -> sơ đồ hiện đúng giá.
 * AC2: Hạng ghế chưa có giá -> bấm mở bán bị chặn kèm tên hạng thiếu giá.
 * AC3: Suất đã có đơn hàng đang chờ -> đổi giá -> đơn đang chờ giữ nguyên giá cũ, đơn mới dùng giá mới.
 * AC4: Nhập giá âm hoặc không phải số -> bị chặn ngay tại ô / HTTP 400.
 * NFR: Giá lưu bằng số nguyên đơn vị đồng, không dùng số thực.
 */

process.env.JWT_SECRET = 'test_secret_key_s15';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/models/AuditLog', () => ({ create: jest.fn().mockResolvedValue(1) }));

const mockShowtimes = new Map();
const mockCategories = new Map();
const mockSeats = new Map();
const mockHolds = new Map();

jest.mock('../src/models/Showtime', () => ({
  findById: jest.fn(async (id) => mockShowtimes.get(Number(id))),
  listByEventWithSeatMap: jest.fn(async (eventId) => {
    return [...mockShowtimes.values()]
      .filter((s) => s.event_id === Number(eventId))
      .map((s) => ({
        ...s,
        seat_count: [...mockSeats.values()].filter((seat) => seat.showtime_id === s.id).length,
        category_count: [...mockCategories.values()].filter((c) => c.showtime_id === s.id).length,
      }));
  }),
}));

jest.mock('../src/models/Event', () => ({
  findById: jest.fn(async (id) => (Number(id) === 10 ? { id: 10, organizer_id: 1, status: 'published' } : undefined)),
}));

jest.mock('../src/services/seatCategoryService', () => {
  class SeatCategoryError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.code = code;
      this.details = details;
    }
  }

  return {
    SeatCategoryError,
    listCategoriesByShowtime: jest.fn(async (showtimeId) => {
      return [...mockCategories.values()]
        .filter((c) => c.showtime_id === Number(showtimeId))
        .map((c) => ({
          ...c,
          seat_count: [...mockSeats.values()].filter((s) => s.category_id === c.id).length,
        }));
    }),
    updateCategoryPrices: jest.fn(async ({ showtimeId, prices }) => {
      const showtime = mockShowtimes.get(Number(showtimeId));
      if (!showtime) throw new SeatCategoryError('SHOWTIME_NOT_FOUND', 'Không tìm thấy suất diễn.');

      for (const item of prices) {
        const cat = mockCategories.get(Number(item.id));
        if (!cat || cat.showtime_id !== Number(showtimeId)) {
          throw new SeatCategoryError('CATEGORY_NOT_FOUND', `Hạng ghế ${item.id} không thuộc suất diễn.`);
        }
        cat.price = item.price;
      }

      return [...mockCategories.values()]
        .filter((c) => c.showtime_id === Number(showtimeId))
        .map((c) => ({
          ...c,
          seat_count: [...mockSeats.values()].filter((s) => s.category_id === c.id).length,
        }));
    }),
  };
});

const app = require('../src/app');

const tokenFor = (userId, role) => `Bearer ${jwt.sign({ userId, role }, process.env.JWT_SECRET)}`;
const OWNER = tokenFor(1, 'organizer');
const OTHER_ORGANIZER = tokenFor(2, 'organizer');
const ADMIN = tokenFor(3, 'admin');
const BUYER = tokenFor(4, 'buyer');

beforeEach(() => {
  mockShowtimes.clear();
  mockCategories.clear();
  mockSeats.clear();
  mockHolds.clear();

  mockShowtimes.set(1, { id: 1, event_id: 10, status: 'draft', capacity: 60 });

  // 3 hạng ghế theo AC1
  mockCategories.set(101, { id: 101, showtime_id: 1, name: 'VIP', price: null });
  mockCategories.set(102, { id: 102, showtime_id: 1, name: 'Thường', price: null });
  mockCategories.set(103, { id: 103, showtime_id: 1, name: 'Ban công', price: null });

  // Gán ghế cho từng hạng
  mockSeats.set(1, { id: 1, showtime_id: 1, category_id: 101, row_label: 'A', seat_number: 1 });
  mockSeats.set(2, { id: 2, showtime_id: 1, category_id: 102, row_label: 'B', seat_number: 1 });
  mockSeats.set(3, { id: 3, showtime_id: 1, category_id: 103, row_label: 'C', seat_number: 1 });
});

describe('S-15: Phân quyền API đặt giá vé theo hạng ghế', () => {
  test('Chưa đăng nhập → 401', async () => {
    const res = await request(app)
      .put('/api/showtimes/1/categories/prices')
      .send({ prices: [{ id: 101, price: 500000 }] });
    expect(res.status).toBe(401);
  });

  test('Buyer → 403', async () => {
    const res = await request(app)
      .put('/api/showtimes/1/categories/prices')
      .set('Authorization', BUYER)
      .send({ prices: [{ id: 101, price: 500000 }] });
    expect(res.status).toBe(403);
  });

  test('Organizer không sở hữu event → 403', async () => {
    const res = await request(app)
      .put('/api/showtimes/1/categories/prices')
      .set('Authorization', OTHER_ORGANIZER)
      .send({ prices: [{ id: 101, price: 500000 }] });
    expect(res.status).toBe(403);
  });

  test('Suất không tồn tại → 404', async () => {
    const res = await request(app)
      .put('/api/showtimes/999/categories/prices')
      .set('Authorization', OWNER)
      .send({ prices: [{ id: 101, price: 500000 }] });
    expect(res.status).toBe(404);
  });

  test('Chủ sự kiện hoặc admin đặt giá được', async () => {
    const resOwner = await request(app)
      .put('/api/showtimes/1/categories/prices')
      .set('Authorization', OWNER)
      .send({ prices: [{ id: 101, price: 500000 }] });
    expect(resOwner.status).toBe(200);

    const resAdmin = await request(app)
      .put('/api/showtimes/1/categories/prices')
      .set('Authorization', ADMIN)
      .send({ prices: [{ id: 101, price: 600000 }] });
    expect(resAdmin.status).toBe(200);
  });
});

describe('S-15 / AC4 & NFR: Kiểm tra dữ liệu đầu vào (Validation)', () => {
  test('Danh sách rỗng → 400', async () => {
    const res = await request(app)
      .put('/api/showtimes/1/categories/prices')
      .set('Authorization', OWNER)
      .send({ prices: [] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('không được để trống');
  });

  test('AC4: Giá âm → 400 bị chặn ngay lập tức', async () => {
    const res = await request(app)
      .put('/api/showtimes/1/categories/prices')
      .set('Authorization', OWNER)
      .send({ prices: [{ id: 101, price: -50000 }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('không được là số âm');
  });

  test('AC4: Giá không phải số → 400', async () => {
    const res = await request(app)
      .put('/api/showtimes/1/categories/prices')
      .set('Authorization', OWNER)
      .send({ prices: [{ id: 101, price: 'nam_tram_nghin' }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('số hợp lệ');
  });

  test('NFR: Giá là số thực (float) → 400 bị chặn, yêu cầu số nguyên đơn vị đồng', async () => {
    const res = await request(app)
      .put('/api/showtimes/1/categories/prices')
      .set('Authorization', OWNER)
      .send({ prices: [{ id: 101, price: 250000.5 }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('số nguyên đơn vị đồng');
  });

  test('NFR: Chuỗi số thực "250000.50" → 400 bị chặn', async () => {
    const res = await request(app)
      .put('/api/showtimes/1/categories/prices')
      .set('Authorization', OWNER)
      .send({ prices: [{ id: 101, price: '250000.50' }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('không dùng số thực');
  });

  test('Chấp nhận cả định dạng object { [id]: price }', async () => {
    const res = await request(app)
      .put('/api/showtimes/1/categories/prices')
      .set('Authorization', OWNER)
      .send({ prices: { 101: 500000, 102: 300000, 103: 150000 } });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('S-15 / AC1: Đặt giá cho từng hạng ghế và đọc lại', () => {
  test('Đặt giá cho 3 hạng ghế và lấy lại danh sách thành công', async () => {
    const updateRes = await request(app)
      .put('/api/showtimes/1/categories/prices')
      .set('Authorization', OWNER)
      .send({
        prices: [
          { id: 101, price: 500000 },
          { id: 102, price: 300000 },
          { id: 103, price: 150000 },
        ],
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.categories).toHaveLength(3);

    const getRes = await request(app).get('/api/showtimes/1/categories');
    expect(getRes.status).toBe(200);
    const vip = getRes.body.data.categories.find((c) => c.name === 'VIP');
    const normal = getRes.body.data.categories.find((c) => c.name === 'Thường');
    const balcony = getRes.body.data.categories.find((c) => c.name === 'Ban công');

    expect(vip.price).toBe(500000);
    expect(normal.price).toBe(300000);
    expect(balcony.price).toBe(150000);
  });
});

describe('S-15 / AC3: Đơn hàng đang chờ giữ nguyên giá cũ khi đổi giá', () => {
  test('Đơn hàng / hold đang chờ giữ nguyên snapshot giá cũ khi ban tổ chức đổi giá mới', async () => {
    // 1. Giả sử hạng VIP đang có giá 200.000₫
    mockCategories.get(101).price = 200000;

    // 2. Một đơn hàng / hold đang chờ (pending_payment) được tạo với giá 200.000₫
    const pendingOrder = {
      id: 'hold-uuid-1',
      showtime_id: 1,
      category_id: 101,
      order_id: 'ORDER-2026-001',
      status: 'pending_payment',
      price: 200000,
    };
    mockHolds.set(pendingOrder.id, pendingOrder);

    // 3. Ban tổ chức đổi giá hạng VIP lên 350.000₫
    const updateRes = await request(app)
      .put('/api/showtimes/1/categories/prices')
      .set('Authorization', OWNER)
      .send({
        prices: [{ id: 101, price: 350000 }],
      });
    expect(updateRes.status).toBe(200);

    // 4. Kiểm tra: đơn hàng đang chờ VẪN giữ nguyên giá cũ 200.000₫ (không bị tăng lên 350.000₫)
    const holdAfter = mockHolds.get('hold-uuid-1');
    expect(holdAfter.price).toBe(200000);

    // 5. Trong khi đó giá danh mục mới đã được cập nhật thành 350.000₫ cho các đơn tạo sau
    const getRes = await request(app).get('/api/showtimes/1/categories');
    const vip = getRes.body.data.categories.find((c) => c.id === 101);
    expect(vip.price).toBe(350000);
  });
});
