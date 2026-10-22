/**
 * Test S-28: Quản trị tạo tài khoản nhân viên, gán vai trò & kiểm soát quyền thời gian thực
 * Covers: AC1, AC2, AC3, NFR-1
 */

process.env.JWT_SECRET = 'test_secret_key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');

// Mock User, Role, RoleChangeLog models
jest.mock('../src/models/User', () => ({
  findByEmail: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  updateById: jest.fn().mockResolvedValue(1),
  listAll: jest.fn(),
  countAll: jest.fn(),
  countActiveAdmins: jest.fn().mockResolvedValue(2),
}));

jest.mock('../src/models/Role', () => ({
  findAll: jest.fn(),
  findByName: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../src/models/RoleChangeLog', () => ({
  create: jest.fn().mockResolvedValue({ id: 1 }),
  list: jest.fn(),
  count: jest.fn(),
}));

jest.mock('../src/models/AuditLog', () => ({
  create: jest.fn().mockResolvedValue(1),
}));

const User = require('../src/models/User');
const Role = require('../src/models/Role');
const RoleChangeLog = require('../src/models/RoleChangeLog');

// Token helpers
const createToken = (userId, role, email = 'user@test.com') =>
  jwt.sign({ userId, role, email }, process.env.JWT_SECRET, { expiresIn: '8h' });

const adminToken = createToken(1, 'admin', 'admin@eventticketing.vn');
const organizerToken = createToken(2, 'organizer', 'org@eventticketing.vn');
const buyerToken = createToken(3, 'buyer', 'buyer@test.com');
const checkerToken = createToken(4, 'ticket_checker', 'checker@eventticketing.vn');

describe('S-28: Quản trị tạo tài khoản nhân viên và gán vai trò', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock behavior for User.findById
    User.findById.mockImplementation((id) => {
      if (id === 1) return Promise.resolve({ id: 1, email: 'admin@eventticketing.vn', role: 'admin', is_active: true });
      if (id === 2) return Promise.resolve({ id: 2, email: 'org@eventticketing.vn', role: 'organizer', is_active: true });
      if (id === 3) return Promise.resolve({ id: 3, email: 'buyer@test.com', role: 'buyer', is_active: true });
      if (id === 4) return Promise.resolve({ id: 4, email: 'checker@eventticketing.vn', role: 'ticket_checker', is_active: true });
      return Promise.resolve(null);
    });

    Role.findByName.mockImplementation((name) => {
      const roles = {
        admin: { id: 1, name: 'admin' },
        organizer: { id: 2, name: 'organizer' },
        buyer: { id: 3, name: 'buyer' },
        ticket_checker: { id: 4, name: 'ticket_checker' },
        accountant: { id: 5, name: 'accountant' },
      };
      return Promise.resolve(roles[name] || null);
    });
  });

  // ─── 1. Phân quyền truy cập các route quản trị ──────────────────────────────
  describe('RBAC bảo vệ Admin endpoints', () => {
    test('❌ Không có token → 401', async () => {
      const res = await request(app).get('/api/admin/users');
      expect(res.status).toBe(401);
    });

    test('❌ Role buyer truy cập API admin → 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${buyerToken}`);
      expect(res.status).toBe(403);
    });

    test('❌ Role organizer truy cập API admin → 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${organizerToken}`);
      expect(res.status).toBe(403);
    });

    test('✅ Role admin truy cập API admin → 200 OK', async () => {
      User.listAll.mockResolvedValue([
        { id: 1, email: 'admin@eventticketing.vn', role: 'admin', is_active: true },
      ]);
      User.countAll.mockResolvedValue(1);

      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.users).toHaveLength(1);
    });
  });

  // ─── 2. Quản trị viên tạo tài khoản nhân viên (S28-T3) ──────────────────────
  describe('POST /api/admin/users - Admin tạo tài khoản nhân viên', () => {
    test('❌ Thiếu email hoặc sai định dạng → 400', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'Password123', role: 'ticket_checker' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Email');
    });

    test('❌ Mật khẩu quá ngắn (< 6 ký tự) → 400', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'staff@test.com', password: '123', role: 'ticket_checker' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Mật khẩu');
    });

    test('❌ Vai trò không hợp lệ → 400', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'staff@test.com', password: 'Password123', role: 'invalid_role' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Vai trò không hợp lệ');
    });

    test('❌ Email đã tồn tại trong hệ thống → 409 Conflict', async () => {
      User.findByEmail.mockResolvedValue({ id: 10, email: 'existing@test.com' });

      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'existing@test.com', password: 'Password123', role: 'ticket_checker' });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('đã được sử dụng');
    });

    test('✅ Tạo tài khoản nhân viên soát vé (ticket_checker) thành công (NFR-1, NFR-3)', async () => {
      User.findByEmail.mockResolvedValue(null);
      User.create.mockResolvedValue([{ id: 10 }]);

      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'soatve01@eventticketing.vn',
          password: 'SecurePassword123',
          full_name: 'Nguyễn Văn Soát Vé',
          role: 'ticket_checker',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe('ticket_checker');
      expect(res.body.data.isActive).toBe(true);

      // Kiểm tra mật khẩu được băm Argon2id khi tạo
      expect(User.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'soatve01@eventticketing.vn',
          is_active: true,
          password_hash: expect.stringMatching(/^\$argon2id\$/),
        })
      );

      // Kiểm tra NFR-1: Ghi log tạo nhân viên kèm actor_id
      expect(RoleChangeLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actor_id: 1, // Admin thực hiện
          new_role: 'ticket_checker',
          action: 'CREATE_STAFF',
        })
      );
    });
  });

  // ─── 3. Đổi vai trò và kiểm tra NFR-1 (S28-T3) ──────────────────────────────
  describe('PATCH /api/admin/users/:id/role - Đổi vai trò người dùng', () => {
    test('❌ Không tìm thấy user → 404', async () => {
      User.findById.mockImplementation((id) => {
        if (id === 1) return Promise.resolve({ id: 1, email: 'admin@eventticketing.vn', role: 'admin', is_active: true });
        return Promise.resolve(null);
      });

      const res = await request(app)
        .patch('/api/admin/users/999/role')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'organizer' });

      expect(res.status).toBe(404);
    });

    test('❌ Không cho phép tự hạ quyền admin duy nhất (NFR-5)', async () => {
      User.findById.mockImplementation((id) => {
        if (id === 1) return Promise.resolve({ id: 1, email: 'admin@eventticketing.vn', role: 'admin', is_active: true });
        return Promise.resolve(null);
      });
      User.countActiveAdmins.mockResolvedValue(1);

      const res = await request(app)
        .patch('/api/admin/users/1/role')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'buyer' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('duy nhất');
    });

    test('✅ Đổi vai trò thành công và ghi nhật ký kèm người thao tác (NFR-1)', async () => {
      User.findById.mockImplementation((id) => {
        if (id === 1) return Promise.resolve({ id: 1, email: 'admin@eventticketing.vn', role: 'admin', is_active: true });
        if (id === 2) return Promise.resolve({ id: 2, email: 'staff@test.com', role: 'buyer', is_active: true });
        return Promise.resolve(null);
      });

      const res = await request(app)
        .patch('/api/admin/users/2/role')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'organizer', reason: 'Thăng chức lên ban tổ chức' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.newRole).toBe('organizer');

      // Ghi log vào role_change_logs
      expect(RoleChangeLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actor_id: 1,
          target_user_id: 2,
          old_role: 'buyer',
          new_role: 'organizer',
          action: 'ROLE_CHANGE',
        })
      );
    });
  });

  // ─── 4. Kích hoạt / Vô hiệu hóa tài khoản (S28-T3, AC3) ──────────────────────
  describe('PATCH /api/admin/users/:id/status - Kích hoạt / Vô hiệu hóa', () => {
    test('❌ Admin không thể tự vô hiệu hóa tài khoản của chính mình (NFR-5)', async () => {
      User.findById.mockImplementation((id) => {
        if (id === 1) return Promise.resolve({ id: 1, email: 'admin@eventticketing.vn', role: 'admin', is_active: true });
        return Promise.resolve(null);
      });

      const res = await request(app)
        .patch('/api/admin/users/1/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ is_active: false });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('chính mình');
    });

    test('✅ Vô hiệu hóa tài khoản thành công và ghi audit log (AC3, NFR-1)', async () => {
      User.findById.mockImplementation((id) => {
        if (id === 1) return Promise.resolve({ id: 1, email: 'admin@eventticketing.vn', role: 'admin', is_active: true });
        if (id === 3) return Promise.resolve({ id: 3, email: 'violator@test.com', role: 'buyer', is_active: true });
        return Promise.resolve(null);
      });

      const res = await request(app)
        .patch('/api/admin/users/3/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ is_active: false, reason: 'Vi phạm quy định đặt chỗ' });

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);

      expect(User.updateById).toHaveBeenCalledWith(
        3,
        expect.objectContaining({
          is_active: false,
          deactivated_at: expect.any(Date),
        })
      );

      expect(RoleChangeLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actor_id: 1,
          target_user_id: 3,
          action: 'DEACTIVATE_USER',
        })
      );
    });
  });

  // ─── 5. AC 2: Quyền mới có hiệu lực ngay lập tức không cần đăng xuất ──────────
  describe('AC 2: Real-time Permission Enforcement', () => {
    test('✅ Khi admin đổi vai trò từ organizer sang buyer, request tiếp theo với token cũ bị từ chối 403 ngay lập tức', async () => {
      // User mang token cũ với role organizer trong JWT payload
      const tokenWithOldOrganizerRole = createToken(2, 'organizer', 'org@eventticketing.vn');

      // Nhưng trong DB, admin vừa đổi quyền của user sang buyer
      User.findById.mockResolvedValue({
        id: 2,
        email: 'org@eventticketing.vn',
        role: 'buyer', // Role mới trong DB
        is_active: true,
        deactivated_at: null,
      });

      // User gọi endpoint chỉ cho phép organizer (/api/organizer/events từ protectedRoutes)
      const res = await request(app)
        .get('/api/organizer/events')
        .set('Authorization', `Bearer ${tokenWithOldOrganizerRole}`);

      // Quyền mới có hiệu lực ngay: bị chặn 403 Forbidden vì giờ chỉ là buyer!
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('không có quyền');
    });
  });

  // ─── 6. AC 3: Đăng nhập với tài khoản bị vô hiệu hóa ─────────────────────────
  describe('AC 3: Đăng nhập với tài khoản bị vô hiệu hóa', () => {
    test('❌ Tài khoản bị vô hiệu hóa khi đăng nhập trả về 403 kèm thông báo liên hệ quản trị', async () => {
      const bcrypt = require('bcryptjs');
      const passHash = await bcrypt.hash('Password123', 10);

      User.findByEmail.mockResolvedValue({
        id: 7,
        email: 'banned@test.com',
        password_hash: passHash,
        is_active: false,
        deactivated_at: new Date('2026-10-20'),
        role: 'buyer',
        failed_login_attempts: 0,
        locked_until: null,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'banned@test.com', password: 'Password123' });

      expect(res.status).toBe(403);
      expect(res.body.isDeactivated).toBe(true);
      expect(res.body.message).toContain('vô hiệu hóa');
      expect(res.body.message).toContain('quản trị viên');
    });

    test('❌ Tài khoản đang mang token gọi API tiếp theo khi bị vô hiệu hóa → bị từ chối 403', async () => {
      const liveToken = createToken(8, 'buyer', 'deact@test.com');

      User.findById.mockResolvedValue({
        id: 8,
        email: 'deact@test.com',
        role: 'buyer',
        is_active: false,
        deactivated_at: new Date(),
      });

      const res = await request(app)
        .get('/api/buyer/tickets')
        .set('Authorization', `Bearer ${liveToken}`);

      expect(res.status).toBe(403);
      expect(res.body.isDeactivated).toBe(true);
      expect(res.body.message).toContain('vô hiệu hóa');
    });
  });

  // ─── 7. AC 1: Soát vé tại cửa cho vai trò ticket_checker ─────────────────────
  describe('AC 1 & Ticket Scanner API', () => {
    test('❌ Role buyer không được phép gọi API soát vé → 403', async () => {
      const res = await request(app)
        .post('/api/tickets/verify')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ code: 'TICK-123456' });

      expect(res.status).toBe(403);
    });

    test('✅ Role ticket_checker soát vé hợp lệ thành công', async () => {
      const res = await request(app)
        .post('/api/tickets/verify')
        .set('Authorization', `Bearer ${checkerToken}`)
        .send({ code: 'TICK-VALID-9999' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('VALID');
      expect(res.body.data).toHaveProperty('attendeeName');
      expect(res.body.data).toHaveProperty('seatLabel');
    });

    test('⚠️ Quét lại vé đã check-in trước đó báo cảnh báo trùng lặp ALREADY_CHECKED_IN (mỗi vé 1 lần)', async () => {
      // Quét lần 2
      const res = await request(app)
        .post('/api/tickets/verify')
        .set('Authorization', `Bearer ${checkerToken}`)
        .send({ code: 'TICK-VALID-9999' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.status).toBe('ALREADY_CHECKED_IN');
      expect(res.body.message).toContain('ĐÃ ĐƯỢC SOÁT');
    });

    test('❌ Quét vé giả mạo báo INVALID', async () => {
      const res = await request(app)
        .post('/api/tickets/verify')
        .set('Authorization', `Bearer ${checkerToken}`)
        .send({ code: 'FAKE-QR-000' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('INVALID');
      expect(res.body.message).toContain('không hợp lệ');
    });
  });
});
