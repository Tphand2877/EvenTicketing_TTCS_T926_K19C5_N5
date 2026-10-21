const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-s32-order-history-secret';

// Mock Order model
jest.mock('../src/models/Order', () => ({
  findById: jest.fn(),
  claimPaymentRequest: jest.fn(),
  storePaymentUrl: jest.fn(),
  markPaymentRequestIndeterminate: jest.fn(),
  getOrdersByUserId: jest.fn(),
  getOrderDetails: jest.fn(),
}));

const Order = require('../src/models/Order');
const app = require('../src/app');

describe('SCRUM-220 [S-32] - Xem lịch sử đơn hàng của tôi', () => {
  const buyer1Token = `Bearer ${jwt.sign({ userId: 1, role: 'buyer', email: 'buyer1@test.com' }, process.env.JWT_SECRET)}`;
  const buyer2Token = `Bearer ${jwt.sign({ userId: 2, role: 'buyer', email: 'buyer2@test.com' }, process.env.JWT_SECRET)}`;

  const mockOrdersList = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      user_id: 1,
      status: 'paid',
      total_amount: 500000,
      currency: 'VND',
      seat_count: 2,
      seats: [
        { id: 1, seat_id: 10, row_label: 'A', seat_number: 1, category_name: 'VIP', unit_price: 250000 },
        { id: 2, seat_id: 11, row_label: 'A', seat_number: 2, category_name: 'VIP', unit_price: 250000 },
      ],
      event: { id: 1, title: 'Đêm nhạc Trịnh Công Sơn', venue: 'Nhà hát Lớn', image_url: 'https://example.com/poster.jpg' },
      showtime: { id: 5, starts_at: '2026-11-20T19:30:00Z', ends_at: '2026-11-20T22:00:00Z' },
      expires_at: '2026-10-21T10:15:00Z',
      created_at: '2026-10-21T10:00:00Z',
      updated_at: '2026-10-21T10:05:00Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      user_id: 1,
      status: 'pending',
      total_amount: 300000,
      currency: 'VND',
      seat_count: 1,
      seats: [
        { id: 3, seat_id: 12, row_label: 'B', seat_number: 5, category_name: 'Standard', unit_price: 300000 },
      ],
      event: { id: 2, title: 'Hài kịch Tuổi Trẻ', venue: 'Sân khấu IDECAF', image_url: null },
      showtime: { id: 6, starts_at: '2026-12-01T20:00:00Z', ends_at: '2026-12-01T22:30:00Z' },
      expires_at: '2026-10-21T11:15:00Z',
      created_at: '2026-10-21T09:00:00Z',
      updated_at: '2026-10-21T09:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AC1 & NFR: Lấy danh sách lịch sử đơn hàng phân trang, mới nhất trước', () => {
    test('trả về danh sách đơn hàng mới nhất trước kèm thông tin sự kiện, số ghế, tổng tiền và phân trang', async () => {
      Order.getOrdersByUserId.mockResolvedValueOnce({
        orders: mockOrdersList,
        pagination: {
          page: 1,
          limit: 10,
          totalOrders: 2,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      });

      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', buyer1Token);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orders).toHaveLength(2);

      // Mới nhất trước: đơn 1 được tạo lúc 10:00, đơn 2 lúc 09:00
      expect(res.body.data.orders[0].id).toBe('11111111-1111-4111-8111-111111111111');
      expect(res.body.data.orders[0].status).toBe('paid');
      expect(res.body.data.orders[0].event.title).toBe('Đêm nhạc Trịnh Công Sơn');
      expect(res.body.data.orders[0].seat_count).toBe(2);
      expect(res.body.data.orders[0].total_amount).toBe(500000);
      expect(res.body.data.orders[0].currency).toBe('VND');

      // Phân trang
      expect(res.body.data.pagination).toEqual({
        page: 1,
        limit: 10,
        totalOrders: 2,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });

      expect(Order.getOrdersByUserId).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          page: 1,
          limit: 10,
        })
      );
    });

    test('truyền tham số phân trang page và limit vào model query', async () => {
      Order.getOrdersByUserId.mockResolvedValueOnce({
        orders: [],
        pagination: {
          page: 2,
          limit: 5,
          totalOrders: 12,
          totalPages: 3,
          hasNextPage: true,
          hasPrevPage: true,
        },
      });

      const res = await request(app)
        .get('/api/orders?page=2&limit=5')
        .set('Authorization', buyer1Token);

      expect(res.status).toBe(200);
      expect(Order.getOrdersByUserId).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          page: '2',
          limit: '5',
        })
      );
    });

    test('hỗ trợ lọc theo trạng thái nếu có query status', async () => {
      Order.getOrdersByUserId.mockResolvedValueOnce({
        orders: [mockOrdersList[0]],
        pagination: {
          page: 1,
          limit: 10,
          totalOrders: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      });

      const res = await request(app)
        .get('/api/orders?status=paid')
        .set('Authorization', buyer1Token);

      expect(res.status).toBe(200);
      expect(Order.getOrdersByUserId).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          status: 'paid',
        })
      );
    });
  });

  describe('AC2: Gọi API với mã đơn của người khác bị từ chối 403 Forbidden', () => {
    test('trả về 403 Forbidden khi truy vấn đơn hàng của người dùng khác', async () => {
      const err = new Error('Bạn không có quyền xem đơn hàng này.');
      err.code = 'ORDER_FORBIDDEN';
      err.status = 403;
      Order.getOrderDetails.mockRejectedValueOnce(err);

      const foreignOrderId = '11111111-1111-4111-8111-111111111111';
      const res = await request(app)
        .get(`/api/orders/${foreignOrderId}`)
        .set('Authorization', buyer2Token);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('ORDER_FORBIDDEN');
      expect(res.body.message).toContain('Bạn không có quyền xem đơn hàng này');
      expect(Order.getOrderDetails).toHaveBeenCalledWith({
        orderId: foreignOrderId,
        userId: 2,
      });
    });

    test('trả về 404 khi mã đơn không tồn tại', async () => {
      const err = new Error('Không tìm thấy đơn hàng.');
      err.code = 'ORDER_NOT_FOUND';
      err.status = 404;
      Order.getOrderDetails.mockRejectedValueOnce(err);

      const nonExistentId = '99999999-9999-4999-8999-999999999999';
      const res = await request(app)
        .get(`/api/orders/${nonExistentId}`)
        .set('Authorization', buyer1Token);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ORDER_NOT_FOUND');
    });

    test('trả về 400 khi mã đơn không đúng định dạng UUID', async () => {
      const res = await request(app)
        .get('/api/orders/invalid-uuid-123')
        .set('Authorization', buyer1Token);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_ORDER_ID');
      expect(Order.getOrderDetails).not.toHaveBeenCalled();
    });

    test('chủ đơn hàng truy vấn thành công chi tiết đơn của chính mình', async () => {
      const orderDetail = {
        ...mockOrdersList[0],
      };
      Order.getOrderDetails.mockResolvedValueOnce(orderDetail);

      const res = await request(app)
        .get(`/api/orders/${orderDetail.id}`)
        .set('Authorization', buyer1Token);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(orderDetail.id);
      expect(res.body.data.status).toBe('paid');
      expect(res.body.data.seats).toHaveLength(2);
    });
  });

  describe('AC3: Đơn đã hết hạn hoặc đã hủy vẫn thấy trong lịch sử với trạng thái tương ứng', () => {
    test('hiển thị đơn hàng có trạng thái expired và cancelled trong danh sách', async () => {
      const expiredAndCancelledOrders = [
        {
          id: '33333333-3333-4333-8333-333333333333',
          user_id: 1,
          status: 'expired',
          total_amount: 150000,
          currency: 'VND',
          seat_count: 1,
          seats: [{ id: 4, seat_id: 20, row_label: 'C', seat_number: 1, category_name: 'Economy', unit_price: 150000 }],
          event: { id: 3, title: 'Nhạc Hội EDM', venue: 'Sân vận động QK7', image_url: null },
          showtime: { id: 7, starts_at: '2026-11-25T18:00:00Z', ends_at: '2026-11-25T23:00:00Z' },
          expires_at: '2026-10-20T10:15:00Z',
          created_at: '2026-10-20T10:00:00Z',
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          user_id: 1,
          status: 'cancelled',
          total_amount: 200000,
          currency: 'VND',
          seat_count: 1,
          seats: [{ id: 5, seat_id: 21, row_label: 'D', seat_number: 3, category_name: 'Economy', unit_price: 200000 }],
          event: { id: 4, title: 'Triển lãm Nghệ thuật', venue: 'Bảo tàng Mỹ thuật', image_url: null },
          showtime: { id: 8, starts_at: '2026-11-30T09:00:00Z', ends_at: '2026-11-30T17:00:00Z' },
          expires_at: '2026-10-19T10:15:00Z',
          created_at: '2026-10-19T10:00:00Z',
        },
      ];

      Order.getOrdersByUserId.mockResolvedValueOnce({
        orders: expiredAndCancelledOrders,
        pagination: {
          page: 1,
          limit: 10,
          totalOrders: 2,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      });

      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', buyer1Token);

      expect(res.status).toBe(200);
      expect(res.body.data.orders).toHaveLength(2);
      expect(res.body.data.orders[0].status).toBe('expired');
      expect(res.body.data.orders[1].status).toBe('cancelled');
    });
  });

  describe('Security & Edge cases', () => {
    test('từ chối 401 khi chưa đăng nhập (không gửi Authorization header)', async () => {
      const res = await request(app).get('/api/orders');
      expect(res.status).toBe(401);
    });

    test('từ chối 401 khi token không hợp lệ', async () => {
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', 'Bearer invalid-token');
      expect(res.status).toBe(401);
    });

    test('trả về mảng rỗng khi người dùng chưa có đơn hàng nào', async () => {
      Order.getOrdersByUserId.mockResolvedValueOnce({
        orders: [],
        pagination: {
          page: 1,
          limit: 10,
          totalOrders: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
      });

      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', buyer1Token);

      expect(res.status).toBe(200);
      expect(res.body.data.orders).toEqual([]);
      expect(res.body.data.pagination.totalOrders).toBe(0);
    });
  });
});
