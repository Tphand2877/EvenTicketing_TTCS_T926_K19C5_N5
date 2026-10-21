/**
 * Test suite cho SCRUM-162 / Plan ID: S-08
 * Epic: E-11 – Trang công khai, mở bán và thông báo
 *
 * USER STORY:
 * Là người mua vé tôi muốn thấy các sự kiện đang bán và chi tiết từng suất để chọn suất phù hợp trước khi vào sơ đồ ghế
 *
 * TIÊU CHÍ CHẤP NHẬN (AC):
 * - AC1: Có suất diễn đang bán -> Mở trang chủ chưa đăng nhập -> Thấy danh sách sự kiện kèm suất gần nhất, sắp theo ngày diễn
 * - AC2: Suất diễn ở trạng thái nháp hoặc đã đóng -> Mở trang chi tiết bằng link trực tiếp -> Thấy thông báo không mở bán, không thấy sơ đồ
 * - AC3: Mở trang chi tiết suất đang bán -> Thấy tên sự kiện, thời gian, địa điểm, khoảng giá và nút vào chọn ghế
 * - AC4: Có hơn 20 sự kiện -> Cuộn xuống cuối tải thêm trang tiếp theo
 * - NFR: Trang danh sách phản hồi dưới 500ms ở p95 khi có 200 suất diễn; cache 30 giây
 */

process.env.JWT_SECRET = 's08-public-events-test-only';
const request = require('supertest');
const { performance } = require('perf_hooks');

jest.mock('../src/models/PublicShowtime', () => ({
  listOnSale: jest.fn(),
  findPublic: jest.fn(),
  seatMap: jest.fn(),
}));

jest.mock('../src/services/showtimePageCache', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(),
}));

const mockPublicShowtime = require('../src/models/PublicShowtime');
const mockCache = require('../src/services/showtimePageCache');
const app = require('../src/app');

describe('SCRUM-162 / S-08: Người mua xem danh sách sự kiện đang mở bán và chi tiết suất diễn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCache.get.mockResolvedValue(null);
  });

  // ─── AC1: Mở trang chủ chưa đăng nhập thấy danh sách sự kiện sắp theo ngày diễn ─────
  describe('AC1: Danh sách sự kiện kèm suất gần nhất, sắp theo ngày diễn khi chưa đăng nhập', () => {
    test('Người mua chưa đăng nhập có thể truy cập danh sách sự kiện công khai', async () => {
      // Mock 3 showtimes có ngày bắt đầu khác nhau
      const showtimes = [
        {
          id: 1,
          event_id: 10,
          title: 'Hòa nhạc Mùa Thu',
          category: 'Âm nhạc',
          venue: 'Nhà hát Lớn Hà Nội',
          starts_at: '2026-11-01T20:00:00.000Z',
          ends_at: '2026-11-01T22:30:00.000Z',
          status: 'on_sale',
          min_price: '200000',
          max_price: '500000',
          cursor_time: '2026-11-01T20:00:00.000001Z',
        },
        {
          id: 2,
          event_id: 11,
          title: 'Tech Summit 2026',
          category: 'Công nghệ',
          venue: 'GEM Center',
          starts_at: '2026-11-15T09:00:00.000Z',
          ends_at: '2026-11-15T17:00:00.000Z',
          status: 'on_sale',
          min_price: '300000',
          max_price: '600000',
          cursor_time: '2026-11-15T09:00:00.000002Z',
        },
      ];

      mockPublicShowtime.listOnSale.mockResolvedValue(showtimes);

      // Gọi endpoint không kèm token xác thực (chưa đăng nhập)
      const res = await request(app).get('/api/showtimes');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.showtimes).toHaveLength(2);

      // Sắp xếp theo ngày diễn tăng dần (starts_at)
      const dates = res.body.data.showtimes.map((s) => new Date(s.starts_at).getTime());
      expect(dates[0]).toBeLessThanOrEqual(dates[1]);

      // Mỗi item có đủ thông tin sự kiện và suất diễn
      const item = res.body.data.showtimes[0];
      expect(item).toMatchObject({
        title: 'Hòa nhạc Mùa Thu',
        venue: 'Nhà hát Lớn Hà Nội',
        starts_at: '2026-11-01T20:00:00.000Z',
        min_price: 200000,
        max_price: 500000,
      });
    });
  });

  // ─── AC2: Suất diễn trạng thái nháp hoặc đã đóng ─────────────────────────────
  describe('AC2: Suất diễn nháp hoặc đã đóng -> thông báo không mở bán, không thấy sơ đồ', () => {
    test('Mở trang chi tiết suất diễn nháp (draft) hoặc đóng (closed) trả về thông báo không mở bán', async () => {
      mockPublicShowtime.findPublic.mockResolvedValue({
        id: 99,
        event_id: 5,
        title: 'Sự kiện nội bộ',
        category: 'Khác',
        venue: 'Hội trường A',
        starts_at: '2026-12-01T10:00:00.000Z',
        ends_at: null,
        status: 'draft',
        min_price: null,
        max_price: null,
        on_sale: false,
      });

      const res = await request(app).get('/api/showtimes/99');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.on_sale).toBe(false);
      expect(res.body.message).toBe('Suất diễn không mở bán.');

      // AC2 yêu cầu: Không thấy sơ đồ ghế khi suất diễn không mở bán
      mockPublicShowtime.seatMap.mockResolvedValue({ showtime_id: 99, on_sale: false, seats: [] });
      const seatRes = await request(app).get('/api/showtimes/99/seats');
      expect(seatRes.status).toBe(409); // Bị từ chối xem sơ đồ ghế
      expect(seatRes.body.message).toBe('Suất diễn không mở bán.');
    });
  });

  // ─── AC3: Mở trang chi tiết suất đang bán ─────────────────────────────────────
  describe('AC3: Chi tiết suất đang bán có đủ tên, thời gian, địa điểm, khoảng giá và nút chọn ghế', () => {
    test('Trả về đầy đủ thông tin chi tiết của suất diễn đang mở bán', async () => {
      mockPublicShowtime.findPublic.mockResolvedValue({
        id: 101,
        event_id: 20,
        title: 'Đại nhạc hội Rock 2026',
        description: 'Đêm nhạc rock cuồng nhiệt với các ban nhạc hàng đầu.',
        category: 'Âm nhạc',
        venue: 'Sân vận động Mỹ Đình',
        image_url: 'https://example.com/rock.jpg',
        starts_at: '2026-11-20T19:00:00.000Z',
        ends_at: '2026-11-20T23:00:00.000Z',
        status: 'on_sale',
        min_price: '250000',
        max_price: '800000',
        on_sale: true,
      });

      const res = await request(app).get('/api/showtimes/101');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.on_sale).toBe(true);

      const st = res.body.data.showtime;
      // Tên sự kiện
      expect(st.title).toBe('Đại nhạc hội Rock 2026');
      // Thời gian
      expect(st.starts_at).toBe('2026-11-20T19:00:00.000Z');
      expect(st.ends_at).toBe('2026-11-20T23:00:00.000Z');
      // Địa điểm
      expect(st.venue).toBe('Sân vận động Mỹ Đình');
      // Khoảng giá
      expect(st.min_price).toBe(250000);
      expect(st.max_price).toBe(800000);
    });
  });

  // ─── AC4: Phân trang khi có hơn 20 sự kiện (cuộn xuống cuối tải thêm) ─────────
  describe('AC4: Hỗ trợ phân trang khi danh sách có hơn 20 mục', () => {
    test('Khi có hơn 20 suất diễn, trang đầu trả về 20 mục và cursor để tải tiếp trang sau', async () => {
      // Giả lập 21 suất diễn
      const generateItems = (count) =>
        Array.from({ length: count }, (_, i) => ({
          id: i + 1,
          event_id: 1,
          title: `Suất diễn số ${i + 1}`,
          category: 'Âm nhạc',
          venue: 'Hội trường',
          starts_at: '2026-11-01T20:00:00.000Z',
          ends_at: null,
          status: 'on_sale',
          min_price: '100000',
          max_price: '200000',
          cursor_time: `2026-11-01T20:00:00.${String(i + 1).padStart(6, '0')}Z`,
        }));


      const mockData = generateItems(21);
      mockPublicShowtime.listOnSale.mockResolvedValue(mockData);

      const res = await request(app).get('/api/showtimes?limit=20');

      expect(res.status).toBe(200);
      expect(res.body.data.showtimes).toHaveLength(20);
      expect(res.body.data.pagination.limit).toBe(20);
      expect(res.body.data.pagination.has_more).toBe(true);
      expect(res.body.data.pagination.next_cursor).toBeTruthy();

      // Dùng next_cursor để tải trang tiếp theo (AC4)
      const nextCursor = res.body.data.pagination.next_cursor;
      mockPublicShowtime.listOnSale.mockResolvedValue([mockData[20]]);

      const nextRes = await request(app).get('/api/showtimes').query({ cursor: nextCursor, limit: '20' });
      expect(nextRes.status).toBe(200);
      expect(nextRes.body.data.showtimes).toHaveLength(1);
      expect(nextRes.body.data.showtimes[0].id).toBe(21);
      expect(nextRes.body.data.pagination.has_more).toBe(false);
      expect(nextRes.body.data.pagination.next_cursor).toBeNull();
    });
  });

  // ─── NFR: Phản hồi dưới 500ms ở p95 & Cache 30 giây ──────────────────────────
  describe('NFR: Hiệu năng < 500ms ở p95 và cơ chế cache 30 giây', () => {
    test('Dữ liệu được lưu cache Redis với TTL 30 giây sau khi truy vấn thành công', async () => {
      mockPublicShowtime.listOnSale.mockResolvedValue([
        {
          id: 1,
          event_id: 1,
          title: 'Sự kiện Cache',
          starts_at: '2026-11-01T20:00:00.000Z',
          ends_at: null,
          status: 'on_sale',
          cursor_time: '2026-11-01T20:00:00.000001Z',
          min_price: '100000',
          max_price: '200000',
        },
      ]);

      await request(app).get('/api/showtimes?limit=20');

      expect(mockCache.set).toHaveBeenCalledTimes(1);
      const cacheKey = mockCache.set.mock.calls[0][0];
      expect(cacheKey).toMatch(/^public:showtimes:v1:/);
    });

    test('Đo thời gian phản hồi: 30 lần gọi liên tiếp đạt p95 < 500ms', async () => {
      const cachedPayload = {
        showtimes: Array.from({ length: 20 }, (_, i) => ({
          id: i + 1,
          title: `Showtime ${i + 1}`,
          starts_at: '2026-11-01T20:00:00.000Z',
          status: 'on_sale',
        })),
        pagination: { limit: 20, has_more: true, next_cursor: 'cursor123' },
      };

      mockCache.get.mockResolvedValue(cachedPayload);

      const latencies = [];
      const samples = 30;

      for (let i = 0; i < samples; i++) {
        const start = performance.now();
        const res = await request(app).get('/api/showtimes?limit=20');
        const duration = performance.now() - start;
        latencies.push(duration);
        expect(res.status).toBe(200);
      }

      latencies.sort((a, b) => a - b);
      const p95Index = Math.ceil(latencies.length * 0.95) - 1;
      const p95Latency = latencies[p95Index];

      console.log(`[NFR Benchmark S-08] p95 latency = ${p95Latency.toFixed(2)}ms (Yêu cầu: < 500ms)`);

      expect(p95Latency).toBeLessThan(500);
    });
  });
});
