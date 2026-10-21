const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.JWT_SECRET = 's17-test-secret';

jest.mock('../src/models/Order', () => ({
  findById: jest.fn(),
  claimPaymentRequest: jest.fn(),
  storePaymentUrl: jest.fn(),
  markPaymentRequestIndeterminate: jest.fn(),
  getOrderDetails: jest.fn(),
  createOrderFromHold: jest.fn(),
}));

jest.mock('../src/middleware/auditLogger', () => ({
  auditAccessDenials: (_req, _res, next) => next(),
}));

const app = require('../src/app');
const orders = require('../src/models/Order');

const USER_ID = 42;
const OTHER_USER_ID = 99;
const ORDER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HOLD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const authHeader = (userId = USER_ID) =>
  `Bearer ${jwt.sign({ userId, role: 'buyer' }, process.env.JWT_SECRET)}`;

describe('S-17 / T-38 & T-39 Order Summary and Server-side Calculation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('T-38: POST /api/payments/orders (createOrderFromHold)', () => {
    test('AC1 & AC2: tạo đơn từ hold thành công và tính lại tổng tiền từ server, bỏ qua client-supplied total', async () => {
      const mockOrderDetails = {
        id: ORDER_ID,
        user_id: USER_ID,
        status: 'pending',
        total_amount: 350000,
        currency: 'VND',
        expires_at: new Date(Date.now() + 600000).toISOString(),
        items: [
          {
            id: 1,
            seat_id: 101,
            row_label: 'A',
            seat_number: 1,
            category_name: 'VIP',
            unit_price: 200000,
          },
          {
            id: 2,
            seat_id: 102,
            row_label: 'A',
            seat_number: 2,
            category_name: 'Standard',
            unit_price: 150000,
          },
        ],
        event: { id: 1, title: 'Đêm Nhạc Trịnh', venue: 'Nhà hát lớn' },
        showtime: { id: 10, starts_at: '2026-11-01T19:00:00.000Z' },
      };

      orders.createOrderFromHold.mockResolvedValueOnce(mockOrderDetails);

      // Client cố tình sửa total_amount thành 1000 VND
      const res = await request(app)
        .post('/api/payments/orders')
        .set('Authorization', authHeader(USER_ID))
        .send({
          holdId: HOLD_ID,
          total_amount: 1000,
          total: 1000,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.order.total_amount).toBe(350000);
      expect(orders.createOrderFromHold).toHaveBeenCalledWith(
        expect.objectContaining({
          holdId: HOLD_ID,
          userId: USER_ID,
        })
      );
    });

    test('trả về 400 nếu thiếu holdId', async () => {
      const res = await request(app)
        .post('/api/payments/orders')
        .set('Authorization', authHeader(USER_ID))
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Thiếu mã giữ chỗ');
      expect(orders.createOrderFromHold).not.toHaveBeenCalled();
    });

    test('trả về 404 nếu lượt giữ không tồn tại', async () => {
      const err = new Error('Không tìm thấy thông tin giữ chỗ.');
      err.code = 'HOLD_NOT_FOUND';
      orders.createOrderFromHold.mockRejectedValueOnce(err);

      const res = await request(app)
        .post('/api/payments/orders')
        .set('Authorization', authHeader(USER_ID))
        .send({ holdId: HOLD_ID });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('HOLD_NOT_FOUND');
    });

    test('trả về 403 nếu cố tạo đơn từ hold của người khác', async () => {
      const err = new Error('Bạn không có quyền tạo đơn cho lượt giữ chỗ này.');
      err.code = 'HOLD_FORBIDDEN';
      orders.createOrderFromHold.mockRejectedValueOnce(err);

      const res = await request(app)
        .post('/api/payments/orders')
        .set('Authorization', authHeader(OTHER_USER_ID))
        .send({ holdId: HOLD_ID });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('HOLD_FORBIDDEN');
    });

    test('trả về 409 nếu hold đã hết hạn', async () => {
      const err = new Error('Lượt giữ chỗ đã hết hạn hoặc bị hủy.');
      err.code = 'HOLD_EXPIRED';
      orders.createOrderFromHold.mockRejectedValueOnce(err);

      const res = await request(app)
        .post('/api/payments/orders')
        .set('Authorization', authHeader(USER_ID))
        .send({ holdId: HOLD_ID });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('HOLD_EXPIRED');
    });
  });

  describe('T-39: GET /api/payments/orders/:orderId/summary', () => {
    test('AC1: đơn vừa tạo thấy tên sự kiện, suất, từng ghế kèm hạng và đơn giá, tổng tiền, thời gian còn lại', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 300000); // 5 phút nữa

      orders.getOrderDetails.mockResolvedValueOnce({
        id: ORDER_ID,
        user_id: USER_ID,
        status: 'pending',
        total_amount: 350000,
        currency: 'VND',
        expires_at: expiresAt.toISOString(),
        database_now: now,
        items: [
          {
            id: 1,
            seat_id: 101,
            row_label: 'B',
            seat_number: 12,
            category_name: 'VIP',
            unit_price: 200000,
          },
          {
            id: 2,
            seat_id: 102,
            row_label: 'B',
            seat_number: 13,
            category_name: 'Standard',
            unit_price: 150000,
          },
        ],
        event: { id: 5, title: 'Hòa Nhạc Mùa Thu', venue: 'Trung tâm Hội nghị Quốc gia' },
        showtime: { id: 20, starts_at: '2026-11-15T20:00:00.000Z' },
      });

      const res = await request(app)
        .get(`/api/payments/orders/${ORDER_ID}/summary`)
        .set('Authorization', authHeader(USER_ID));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const { order } = res.body.data;
      expect(order.id).toBe(ORDER_ID);
      expect(order.total_amount).toBe(350000);
      expect(order.event.title).toBe('Hòa Nhạc Mùa Thu');
      expect(order.event.venue).toBe('Trung tâm Hội nghị Quốc gia');
      expect(order.showtime.starts_at).toBe('2026-11-15T20:00:00.000Z');
      expect(order.items).toHaveLength(2);
      expect(order.items[0]).toEqual({
        id: 1,
        seat_id: 101,
        row: 'B',
        number: 12,
        category_name: 'VIP',
        unit_price: 200000,
      });
      expect(order.is_expired).toBe(false);
      expect(order.status).toBe('pending');
    });

    test('AC3: thời hạn thanh toán đã hết, trả về is_expired: true và status: expired', async () => {
      const now = new Date();
      const expiredTime = new Date(now.getTime() - 10000); // Đã hết hạn 10s trước

      orders.getOrderDetails.mockResolvedValueOnce({
        id: ORDER_ID,
        user_id: USER_ID,
        status: 'pending',
        total_amount: 200000,
        currency: 'VND',
        expires_at: expiredTime.toISOString(),
        database_now: now,
        items: [
          {
            id: 1,
            seat_id: 101,
            row_label: 'A',
            seat_number: 1,
            category_name: 'Standard',
            unit_price: 200000,
          },
        ],
        event: { id: 1, title: 'Rock Storm' },
        showtime: { id: 1, starts_at: '2026-12-01T19:00:00.000Z' },
      });

      const res = await request(app)
        .get(`/api/payments/orders/${ORDER_ID}/summary`)
        .set('Authorization', authHeader(USER_ID));

      expect(res.status).toBe(200);
      expect(res.body.data.order.is_expired).toBe(true);
      expect(res.body.data.order.status).toBe('expired');
    });

    test('NFR: chỉ chủ đơn xem được đơn (khác user_id trả về 403 Forbidden)', async () => {
      orders.getOrderDetails.mockResolvedValueOnce({
        id: ORDER_ID,
        user_id: USER_ID,
        status: 'pending',
        total_amount: 200000,
        currency: 'VND',
        expires_at: new Date(Date.now() + 60000).toISOString(),
        database_now: new Date(),
      });

      const res = await request(app)
        .get(`/api/payments/orders/${ORDER_ID}/summary`)
        .set('Authorization', authHeader(OTHER_USER_ID));

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORDER_FORBIDDEN');
      expect(res.body.message).toContain('không có quyền xem');
    });

    test('chưa đăng nhập trả về 401 Unauthorized', async () => {
      const res = await request(app).get(`/api/payments/orders/${ORDER_ID}/summary`);
      expect(res.status).toBe(401);
    });

    test('không tìm thấy đơn trả về 404 Not Found', async () => {
      orders.getOrderDetails.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/api/payments/orders/${ORDER_ID}/summary`)
        .set('Authorization', authHeader(USER_ID));

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ORDER_NOT_FOUND');
    });
  });
});
