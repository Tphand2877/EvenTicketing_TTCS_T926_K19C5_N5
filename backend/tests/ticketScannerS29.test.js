/**
 * S-29: Nhân viên soát vé chọn suất diễn và cửa trước khi quét
 * Acceptance Criteria (AC):
 * AC1: Chọn suất diễn đang diễn ra hôm nay và tên cửa trước khi camera bật
 * AC2: Khi đổi sang cửa khác, các lần quét sau ghi nhận cửa mới (kèm cảnh báo cửa cũ nếu quét trùng)
 * AC3: Khi không có suất diễn hôm nay, trả về danh sách rỗng để hiển thị thông báo
 */

process.env.JWT_SECRET = 'test_secret_key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock User model for authentication middleware
jest.mock('../src/models/User', () => ({
  findById: jest.fn(),
  findByEmail: jest.fn(),
}));

jest.mock('../src/models/AuditLog', () => ({
  create: jest.fn().mockResolvedValue(1),
}));

// Mock Database (Knex)
const mockHasTable = jest.fn();
const mockShowtimesQuery = {
  join: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  whereNot: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  orderBy: jest.fn(),
};
const mockGatesQuery = {
  whereIn: jest.fn().mockReturnThis(),
  orderBy: jest.fn(),
};

const mockDb = jest.fn((table) => {
  if (table === 'showtimes') return mockShowtimesQuery;
  if (table === 'event_gates') return mockGatesQuery;
  return mockShowtimesQuery;
});
mockDb.schema = {
  hasTable: mockHasTable,
};

jest.mock('../src/config/database', () => mockDb);

const app = require('../src/app');
const User = require('../src/models/User');

// Token helper
const createToken = (userId, role, email = 'user@test.com') =>
  jwt.sign({ userId, role, email }, process.env.JWT_SECRET, { expiresIn: '8h' });

const checkerToken = createToken(10, 'ticket_checker', 'checker@eventticketing.vn');
const adminToken = createToken(1, 'admin', 'admin@eventticketing.vn');
const buyerToken = createToken(3, 'buyer', 'buyer@test.com');
const organizerToken = createToken(2, 'organizer', 'org@eventticketing.vn');

describe('S-29: Nhân viên soát vé chọn suất diễn và cửa trước khi quét', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    User.findById.mockImplementation((id) => {
      if (id === 1) return Promise.resolve({ id: 1, email: 'admin@eventticketing.vn', role: 'admin', is_active: true });
      if (id === 2) return Promise.resolve({ id: 2, email: 'org@eventticketing.vn', role: 'organizer', is_active: true });
      if (id === 3) return Promise.resolve({ id: 3, email: 'buyer@test.com', role: 'buyer', is_active: true });
      if (id === 10) return Promise.resolve({ id: 10, email: 'checker@eventticketing.vn', role: 'ticket_checker', is_active: true });
      return Promise.resolve(null);
    });

    // Default: tables exist, empty results unless specified in individual tests
    mockHasTable.mockResolvedValue(true);
    mockShowtimesQuery.orderBy.mockResolvedValue([]);
    mockGatesQuery.orderBy.mockResolvedValue([]);
  });

  // ─── 1. S-29 AC1 & AC3: API Lấy suất diễn hôm nay và danh sách cổng ──────────
  describe('AC1 & AC3: GET /api/tickets/today-showtimes', () => {
    test('❌ Chưa đăng nhập bị từ chối 401 Unauthorized', async () => {
      const res = await request(app).get('/api/tickets/today-showtimes');
      expect(res.status).toBe(401);
    });

    test('❌ Role buyer hoặc organizer không có quyền soát vé → 403 Forbidden', async () => {
      const resBuyer = await request(app)
        .get('/api/tickets/today-showtimes')
        .set('Authorization', `Bearer ${buyerToken}`);
      expect(resBuyer.status).toBe(403);

      const resOrg = await request(app)
        .get('/api/tickets/today-showtimes')
        .set('Authorization', `Bearer ${organizerToken}`);
      expect(resOrg.status).toBe(403);
    });

    test('✅ Role ticket_checker hoặc admin được phép truy cập danh sách suất diễn hôm nay', async () => {
      mockShowtimesQuery.orderBy.mockResolvedValue([
        {
          id: 501,
          event_id: 201,
          event_title: 'Live Concert V-Pop 2026',
          event_venue: 'Nhà hát Hòa Bình, TP.HCM',
          starts_at: new Date().toISOString(),
          ends_at: new Date().toISOString(),
          status: 'on_sale',
          capacity: 2000,
        },
      ]);
      mockGatesQuery.orderBy.mockResolvedValue([
        { event_id: 201, name: 'Cổng A - Tầng Trệt' },
        { event_id: 201, name: 'Cổng B - Tầng 1' },
      ]);

      const res = await request(app)
        .get('/api/tickets/today-showtimes')
        .set('Authorization', `Bearer ${checkerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('date');
      expect(res.body.data.showtimes).toHaveLength(1);
      expect(res.body.data.showtimes[0].event_title).toBe('Live Concert V-Pop 2026');
      expect(res.body.data.showtimes[0].gates).toEqual(['Cổng A - Tầng Trệt', 'Cổng B - Tầng 1']);
      expect(res.body.data.total).toBe(1);
    });

    test('✅ AC3: Trả về total = 0 và showtimes = [] khi hôm nay không có sự kiện', async () => {
      mockShowtimesQuery.orderBy.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/tickets/today-showtimes')
        .set('Authorization', `Bearer ${checkerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.showtimes).toEqual([]);
      expect(res.body.data.total).toBe(0);
    });

    test('✅ Chế độ include_sample=true trả về danh sách mẫu kèm cổng khi DB rỗng', async () => {
      mockShowtimesQuery.orderBy.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/tickets/today-showtimes?include_sample=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBeGreaterThan(0);
      const first = res.body.data.showtimes[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('event_title');
      expect(first).toHaveProperty('gates');
      expect(Array.isArray(first.gates)).toBe(true);
      expect(first.gates.length).toBeGreaterThan(0);
    });

    test('✅ Fallback về defaultGates nếu sự kiện không khai báo event_gates', async () => {
      mockShowtimesQuery.orderBy.mockResolvedValue([
        {
          id: 502,
          event_id: 202,
          event_title: 'Kịch nói Mùa Xuân',
          event_venue: 'Sân khấu Idecaf',
          starts_at: new Date().toISOString(),
          status: 'on_sale',
        },
      ]);
      mockGatesQuery.orderBy.mockResolvedValue([]); // Không có gate riêng

      const res = await request(app)
        .get('/api/tickets/today-showtimes')
        .set('Authorization', `Bearer ${checkerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.showtimes[0].gates).toEqual([
        'Cổng chính',
        'Cổng A',
        'Cổng B',
        'Cổng VIP',
      ]);
    });
  });

  // ─── 2. S-29 AC1 & AC2: Ghi nhận cửa khi quét và đổi cửa ───────────────────
  describe('AC1 & AC2: Ghi nhận cửa vào và phản ứng khi đổi cửa', () => {
    test('❌ Thiếu mã vé trả về 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/tickets/verify')
        .set('Authorization', `Bearer ${checkerToken}`)
        .send({ gate: 'Cổng A' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Vui lòng cung cấp mã vé');
    });

    test('✅ AC1: Lần quét đầu tiên tại "Cổng A" ghi nhận chính xác cửa vào', async () => {
      const res = await request(app)
        .post('/api/tickets/verify')
        .set('Authorization', `Bearer ${checkerToken}`)
        .send({
          code: 'S29-TICK-GATEA-001',
          gate: 'Cổng A',
          showtimeId: 901,
          eventTitle: 'Đại nhạc hội Symphony of Lights 2026',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('VALID');
      expect(res.body.data.gate).toBe('Cổng A');
      expect(res.body.data.showtimeId).toBe(901);
      expect(res.body.message).toContain('Cổng A');
    });

    test('✅ AC2: Đổi sang "Cổng B" - Các lần quét tiếp theo ghi nhận cửa mới "Cổng B"', async () => {
      // Nhân viên chuyển cửa sang Cổng B
      const res = await request(app)
        .post('/api/tickets/verify')
        .set('Authorization', `Bearer ${checkerToken}`)
        .send({
          code: 'S29-TICK-GATEB-002',
          gate: 'Cổng B',
          showtimeId: 901,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('VALID');
      expect(res.body.data.gate).toBe('Cổng B');
      expect(res.body.message).toContain('Cổng B');
    });

    test('⚠️ AC2: Quét lại vé đã vào cửa "Cổng A" tại "Cổng B" → cảnh báo trùng lặp và chỉ rõ cửa ban đầu', async () => {
      // Vé S29-TICK-GATEA-001 đã check-in tại Cổng A, giờ bị quét lại tại Cổng B
      const res = await request(app)
        .post('/api/tickets/verify')
        .set('Authorization', `Bearer ${checkerToken}`)
        .send({
          code: 'S29-TICK-GATEA-001',
          gate: 'Cổng B',
          showtimeId: 901,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.status).toBe('ALREADY_CHECKED_IN');
      expect(res.body.data.firstGate).toBe('Cổng A');
      expect(res.body.data.currentGate).toBe('Cổng B');
      expect(res.body.message).toContain('Cổng A');
      expect(res.body.message).toContain('ĐÃ ĐƯỢC SOÁT VÀO CỬA');
    });

    test('✅ Hỗ trợ tên cửa tùy biến (Custom gate name do nhân viên nhập)', async () => {
      const res = await request(app)
        .post('/api/tickets/verify')
        .set('Authorization', `Bearer ${checkerToken}`)
        .send({
          code: 'S29-TICK-CUSTOM-003',
          gate: 'Cửa 3 - Khán đài C',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.gate).toBe('Cửa 3 - Khán đài C');
    });

    test('✅ Tự động gán "Cổng chính" nếu không truyền tên cửa (đảm bảo tương thích ngược)', async () => {
      const res = await request(app)
        .post('/api/tickets/verify')
        .set('Authorization', `Bearer ${checkerToken}`)
        .send({
          code: 'S29-TICK-DEFAULT-004',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.gate).toBe('Cổng chính');
    });

    test('❌ Quét vé giả mạo ghi nhận thông tin và cửa quét', async () => {
      const res = await request(app)
        .post('/api/tickets/verify')
        .set('Authorization', `Bearer ${checkerToken}`)
        .send({
          code: 'FAKE-TICKET-S29',
          gate: 'Cổng VIP',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('INVALID');
      expect(res.body.data.gate).toBe('Cổng VIP');
    });
  });

  // ─── 3. Lịch sử các lần quét gần nhất ─────────────────────────────────────────
  describe('GET /api/tickets/recent-scans', () => {
    test('✅ Trả về danh sách các lần quét gần đây kèm cửa soát vé', async () => {
      const res = await request(app)
        .get('/api/tickets/recent-scans')
        .set('Authorization', `Bearer ${checkerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.recentScans)).toBe(true);
      expect(typeof res.body.data.totalCheckedIn).toBe('number');
      expect(res.body.data.totalCheckedIn).toBeGreaterThan(0);
    });
  });
});
