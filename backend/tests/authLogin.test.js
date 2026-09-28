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
}));

const User = require('../src/models/User');

// ─── Hash password sẵn để dùng trong test ────────────────────────────────────
const PASSWORD = 'password123';
let hashedPassword;

beforeAll(async () => {
  hashedPassword = await bcrypt.hash(PASSWORD, 10);
});

afterEach(() => {
  jest.clearAllMocks();
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
    User.findByEmail.mockResolvedValue({
      id: 1,
      email: 'user@test.com',
      password_hash: hashedPassword,
      is_active: true,
      role: 'buyer',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });

  test('❌ Tài khoản chưa kích hoạt → 403', async () => {
    User.findByEmail.mockResolvedValue({
      id: 1,
      email: 'inactive@test.com',
      password_hash: hashedPassword,
      is_active: false, // chưa kích hoạt
      role: 'buyer',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inactive@test.com', password: PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('kích hoạt');
  });

  test('✅ Đăng nhập thành công → 200 + token', async () => {
    User.findByEmail.mockResolvedValue({
      id: 1,
      email: 'buyer@test.com',
      full_name: 'Test User',
      password_hash: hashedPassword,
      is_active: true,
      role: 'buyer',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'buyer@test.com', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data.user.role).toBe('buyer');
  });
});
