/**
 * Test SCRUM-74: POST /api/auth/login
 * Dùng mock để không cần kết nối DB thật
 */

process.env.JWT_SECRET = 'test_secret_key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');

// Mock User model để không cần DB thật
jest.mock('../src/models/User', () => ({
  findByEmail: jest.fn(),
  findById: jest.fn(),
  updateById: jest.fn().mockResolvedValue(1),
}));
jest.mock('../src/models/AuditLog', () => ({
  create: jest.fn().mockResolvedValue(1),
}));

const User = require('../src/models/User');

// ─── Hash password sẵn để dùng trong test (giả lập user cũ còn hash bcrypt) ───
const PASSWORD = 'password123';
let hashedPassword;

beforeAll(async () => {
  hashedPassword = await bcrypt.hash(PASSWORD, 10);
});

afterEach(() => {
  jest.clearAllMocks();
});

// Helper: user hợp lệ, chưa từng đăng nhập sai lần nào
const baseUser = (overrides = {}) => ({
  id: 1,
  email: 'user@test.com',
  password_hash: hashedPassword,
  is_active: true,
  role: 'buyer',
  failed_login_attempts: 0,
  locked_until: null,
  ...overrides,
});

describe('POST /api/auth/login', () => {
  test('❌ Thiếu email → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'abc123' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('❌ Email sai định dạng → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'abc123' });

    expect(res.status).toBe(400);
  });

  test('❌ Email không tồn tại trong DB → 401', async () => {
    User.findByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noone@test.com', password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('❌ Mật khẩu sai → 401', async () => {
    User.findByEmail.mockResolvedValue(baseUser({ email: 'user@test.com' }));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    // T-07: sau 1 lần sai, phải cập nhật bộ đếm trong DB
    expect(User.updateById).toHaveBeenCalledWith(1, { failed_login_attempts: 1 });
  });

  test('❌ Tài khoản chưa kích hoạt → 403', async () => {
    User.findByEmail.mockResolvedValue(
      baseUser({ email: 'inactive@test.com', is_active: false })
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inactive@test.com', password: PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('kích hoạt');
  });

  test('✅ Đăng nhập thành công → 200 + token', async () => {
    User.findByEmail.mockResolvedValue(
      baseUser({ email: 'buyer@test.com', full_name: 'Test User' })
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'buyer@test.com', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data.user.role).toBe('buyer');
    // T-07: đăng nhập thành công phải reset bộ đếm về 0
    expect(User.updateById).toHaveBeenCalledWith(1, {
      failed_login_attempts: 0,
      locked_until: null,
    });
  });

  test('✅ Đăng nhập thành công với hash bcrypt cũ → tự động nâng cấp lên Argon2id (T-09)', async () => {
    User.findByEmail.mockResolvedValue(baseUser({ email: 'legacy@test.com' }));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'legacy@test.com', password: PASSWORD });

    expect(res.status).toBe(200);
    // Phải có 1 lệnh updateById ghi lại password_hash mới bắt đầu bằng $argon2
    const rehashCall = User.updateById.mock.calls.find(
      (call) => call[1] && call[1].password_hash
    );
    expect(rehashCall).toBeDefined();
    expect(rehashCall[1].password_hash.startsWith('$argon2')).toBe(true);
  });
});
