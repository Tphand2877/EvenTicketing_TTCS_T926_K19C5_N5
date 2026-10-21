const Order = require('../src/models/Order');

describe('Order Model - getOrdersByUserId and getOrderDetails (S-32)', () => {
  describe('getOrdersByUserId', () => {
    test('xử lý phân trang mặc định và trả về danh sách đơn hàng đã gán thêm thông tin', async () => {
      const mockDatabase = jest.fn((table) => {
        if (table === 'orders') {
          const query = {
            where: jest.fn().mockReturnThis(),
            clone: jest.fn().mockReturnThis(),
            count: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ total: '15' }),
            select: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            offset: jest.fn().mockResolvedValue([
              {
                id: 'ord-1',
                user_id: 10,
                status: 'pending',
                total_amount: 200000,
                currency: 'VND',
                expires_at: '2026-10-21T10:00:00Z',
                database_now: '2026-10-21T10:05:00Z', // Đã quá hạn
                created_at: '2026-10-21T09:50:00Z',
                updated_at: '2026-10-21T09:50:00Z',
              },
              {
                id: 'ord-2',
                user_id: 10,
                status: 'paid',
                total_amount: 400000,
                currency: 'VND',
                expires_at: '2026-10-21T12:00:00Z',
                database_now: '2026-10-21T10:05:00Z',
                created_at: '2026-10-21T09:00:00Z',
                updated_at: '2026-10-21T09:05:00Z',
              },
            ]),
          };
          return query;
        }

        if (table === 'order_items') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            whereIn: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockResolvedValue([
              {
                item_id: 101,
                order_id: 'ord-1',
                seat_id: 1,
                category_name: 'VIP',
                unit_price: 200000,
                released_at: null,
                row_label: 'A',
                seat_number: 1,
                showtime_id: 5,
                showtime_starts_at: '2026-11-01T19:00:00Z',
                showtime_ends_at: '2026-11-01T21:00:00Z',
                event_id: 1,
                event_title: 'Sự kiện 1',
                event_venue: 'Hà Nội',
                event_image_url: null,
              },
            ]),
          };
        }

        return {};
      });
      mockDatabase.raw = (str) => str;

      const result = await Order.getOrdersByUserId({
        userId: 10,
        page: 1,
        limit: 10,
        database: mockDatabase,
      });

      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        totalOrders: 15,
        totalPages: 2,
        hasNextPage: true,
        hasPrevPage: false,
      });

      expect(result.orders).toHaveLength(2);
      // Đơn 1 pending nhưng expires_at < database_now -> chuyển thành expired (AC3)
      expect(result.orders[0].id).toBe('ord-1');
      expect(result.orders[0].status).toBe('expired');
      expect(result.orders[0].seat_count).toBe(1);
      expect(result.orders[0].event.title).toBe('Sự kiện 1');

      // Đơn 2 giữ nguyên status paid
      expect(result.orders[1].id).toBe('ord-2');
      expect(result.orders[1].status).toBe('paid');
      expect(result.orders[1].seat_count).toBe(0);
    });

    test('trả về rỗng khi không có đơn hàng nào', async () => {
      const mockDatabase = jest.fn((table) => {
        if (table === 'orders') {
          return {
            where: jest.fn().mockReturnThis(),
            clone: jest.fn().mockReturnThis(),
            count: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ total: '0' }),
            select: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            offset: jest.fn().mockResolvedValue([]),
          };
        }
        return {};
      });
      mockDatabase.raw = (str) => str;

      const result = await Order.getOrdersByUserId({
        userId: 99,
        database: mockDatabase,
      });

      expect(result.orders).toEqual([]);
      expect(result.pagination.totalOrders).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });
  });

  describe('getOrderDetails', () => {
    test('ném lỗi ORDER_NOT_FOUND khi đơn hàng không tồn tại', async () => {
      const mockDatabase = jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      }));
      mockDatabase.raw = (str) => str;

      await expect(
        Order.getOrderDetails({ orderId: 'not-found', userId: 1, database: mockDatabase })
      ).rejects.toMatchObject({
        code: 'ORDER_NOT_FOUND',
        status: 404,
      });
    });

    test('ném lỗi ORDER_FORBIDDEN (403) khi người gọi không phải chủ đơn (AC2)', async () => {
      const mockDatabase = jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          id: 'ord-abc',
          user_id: 55, // khác với userId gọi (1)
        }),
      }));
      mockDatabase.raw = (str) => str;

      await expect(
        Order.getOrderDetails({ orderId: 'ord-abc', userId: 1, database: mockDatabase })
      ).rejects.toMatchObject({
        code: 'ORDER_FORBIDDEN',
        status: 403,
      });
    });

    test('trả về thông tin chi tiết đầy đủ khi chủ đơn truy vấn', async () => {
      const mockDatabase = jest.fn((table) => {
        if (table === 'orders') {
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'ord-123',
              user_id: 1,
              status: 'paid',
              total_amount: 300000,
              currency: 'VND',
              expires_at: '2026-10-21T10:00:00Z',
              created_at: '2026-10-21T09:00:00Z',
              updated_at: '2026-10-21T09:05:00Z',
            }),
          };
        }
        if (table === 'order_items') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockResolvedValue([
              {
                item_id: 1,
                seat_id: 10,
                category_name: 'VIP',
                unit_price: 300000,
                row_label: 'A',
                seat_number: 1,
                showtime_id: 100,
              },
            ]),
          };
        }
        if (table === 'showtimes') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 100,
              event_id: 200,
              starts_at: '2026-11-01T20:00:00Z',
              ends_at: '2026-11-01T22:00:00Z',
            }),
          };
        }
        if (table === 'events') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 200,
              title: 'Live Concert',
              venue: 'SVĐ Mỹ Đình',
              image_url: 'https://img.test/concert.jpg',
            }),
          };
        }
        return {};
      });
      mockDatabase.raw = (str) => str;

      const result = await Order.getOrderDetails({
        orderId: 'ord-123',
        userId: 1,
        database: mockDatabase,
      });

      expect(result.id).toBe('ord-123');
      expect(result.status).toBe('paid');
      expect(result.seat_count).toBe(1);
      expect(result.seats[0].seat_id).toBe(10);
      expect(result.event.title).toBe('Live Concert');
      expect(result.showtime.starts_at).toBe('2026-11-01T20:00:00Z');
    });
  });
});
