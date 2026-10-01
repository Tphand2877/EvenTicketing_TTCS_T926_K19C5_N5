/**
 * SCRUM-76 [S-03] - Buyer Registration & Email Verification Integration Tests
 *
 * Kiểm thử toàn diện:
 * - AC1: Đăng ký thành công (is_active: false, role: buyer, activation token 24h, activation email)
 * - AC2: Email đã tồn tại (Generic message, chống user enumeration)
 * - AC3: Kiểm tra mật khẩu (Password validation < 8 ký tự bị chặn 400)
 * - AC4: Liên kết kích hoạt hết hạn & Gửi lại liên kết mới
 * - AC5: Đăng nhập tài khoản chưa kích hoạt (bị chặn 403 kèm hướng dẫn)
 * - NFR: Single-use token, Cryptographically secure token, Rate limit 5 lần/giờ
 */

process.env.JWT_SECRET = 'test_secret_key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const emailService = require('../src/services/emailService');

// In-memory mock database for isolated test execution
const mockUsers = [];
const mockVerificationRequests = [];
let mockNextUserId = 1;

jest.mock('../src/models/User', () => ({
  findByEmail: jest.fn((email) => {
    const user = mockUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    return Promise.resolve(user ? { ...user, role: 'buyer' } : null);
  }),
  findById: jest.fn((id) => {
    const user = mockUsers.find((u) => u.id === id);
    return Promise.resolve(user ? { ...user, role: 'buyer' } : null);
  }),
  findByActivationToken: jest.fn((token) => {
    const user = mockUsers.find((u) => u.activation_token === token);
    return Promise.resolve(user ? { ...user } : null);
  }),
  create: jest.fn((userData) => {
    const newUser = {
      id: mockNextUserId++,
      ...userData,
      failed_login_attempts: 0,
      locked_until: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    mockUsers.push(newUser);
    return Promise.resolve([newUser.id]);
  }),
  updateById: jest.fn((id, updateData) => {
    const index = mockUsers.findIndex((u) => u.id === id);
    if (index !== -1) {
      mockUsers[index] = { ...mockUsers[index], ...updateData, updated_at: new Date() };
      return Promise.resolve(1);
    }
    return Promise.resolve(0);
  }),
}));

jest.mock('../src/models/Role', () => ({
  findByName: jest.fn((name) => Promise.resolve({ id: 3, name })),
  findById: jest.fn((id) => Promise.resolve({ id, name: 'buyer' })),
}));

// Mock Knex query builder for verification_requests table
jest.mock('../src/config/database', () => {
  const db = jest.fn((table) => {
    if (table === 'verification_requests') {
      let filterEmail = null;
      let filterTime = null;

      const queryBuilder = {
        where: jest.fn((col, opOrVal, val) => {
          if (col === 'email') {
            filterEmail = opOrVal;
          }
          if (col === 'created_at' && opOrVal === '>=') {
            filterTime = val;
          }
          return queryBuilder;
        }),
        count: jest.fn(() => queryBuilder),
        first: jest.fn(() => {
          let matches = mockVerificationRequests;
          if (filterEmail) {
            matches = matches.filter((r) => r.email === filterEmail);
          }
          if (filterTime) {
            matches = matches.filter((r) => new Date(r.created_at) >= new Date(filterTime));
          }
          return Promise.resolve({ count: matches.length });
        }),
        insert: jest.fn((data) => {
          mockVerificationRequests.push({
            id: mockVerificationRequests.length + 1,
            email: data.email,
            request_type: data.request_type || 'register',
            created_at: new Date(),
          });
          return Promise.resolve([mockVerificationRequests.length]);
        }),
      };
      return queryBuilder;
    }
    return db;
  });

  db.fn = { now: () => new Date() };
  return db;
});

describe('SCRUM-76 [S-03] Buyer Registration & Email Verification', () => {
  beforeEach(() => {
    mockUsers.length = 0;
    mockVerificationRequests.length = 0;
    mockNextUserId = 1;
    emailService.clearSentEmails();
    jest.clearAllMocks();
  });

  describe('AC1 — Đăng ký thành công (Successful registration)', () => {
    test('Khách truy cập đăng ký hợp lệ -> tạo tài khoản buyer is_active=false và gửi link kích hoạt 24h', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'buyer1@example.com',
          password: 'Password123!',
          full_name: 'Nguyen Van A',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Nếu email hợp lệ');

      // Kiểm tra user được lưu vào DB
      expect(mockUsers.length).toBe(1);
      const user = mockUsers[0];
      expect(user.email).toBe('buyer1@example.com');
      expect(user.is_active).toBe(false); // Trạng thái Pending Verification
      expect(user.role_id).toBe(3); // Role buyer
      expect(user.password_hash.startsWith('$argon2')).toBe(true); // Hash Argon2id
      expect(user.activation_token).toBeDefined();
      expect(user.activation_token.length).toBe(64); // 32 bytes hex = 64 chars (NFR crypto)

      // Kiểm tra thời hạn 24 giờ
      const ttlMs = new Date(user.activation_token_expires_at).getTime() - Date.now();
      expect(ttlMs).toBeGreaterThan(23 * 60 * 60 * 1000);
      expect(ttlMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 5000);

      // Kiểm tra email được gửi
      const sent = emailService.getSentEmails();
      expect(sent.length).toBe(1);
      expect(sent[0].to).toBe('buyer1@example.com');
      expect(sent[0].verificationUrl).toContain(`/verify-email?token=${user.activation_token}`);
    });
  });

  describe('AC2 — Email đã tồn tại (Chống User Enumeration)', () => {
    test('Khi email đã tồn tại -> trả thông báo chung, không lộ email và không tạo trùng lặp', async () => {
      // Giả lập user đã có sẵn
      mockUsers.push({
        id: 99,
        email: 'existing@example.com',
        password_hash: '$argon2id$v=19$m=65536,t=3,p=4$fakehash',
        is_active: true,
        role_id: 3,
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'existing@example.com',
          password: 'Password999!',
        });

      // Status 200/201 với generic message
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Nếu email hợp lệ, bạn sẽ nhận được hướng dẫn kích hoạt tài khoản.');

      // Không tạo thêm user nào
      expect(mockUsers.length).toBe(1);
      // Không gửi email kích hoạt cho user đã tồn tại
      expect(emailService.getSentEmails().length).toBe(0);
    });
  });

  describe('AC3 — Kiểm tra mật khẩu (Password validation)', () => {
    test('Mật khẩu ít hơn 8 ký tự -> bị từ chối với HTTP 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'shortpass@example.com',
          password: 'pass1', // < 8 ký tự
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Mật khẩu phải có ít nhất 8 ký tự.');
      expect(mockUsers.length).toBe(0);
    });

    test('Email không hợp lệ -> bị từ chối với HTTP 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'not-an-email',
          password: 'validPassword123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Email không đúng định dạng.');
    });
  });

  describe('AC4 — Kích hoạt tài khoản và xử lý liên kết hết hạn (Expired activation link)', () => {
    test('Token hợp lệ và còn hạn -> kích hoạt thành công (is_active = true, token bị xóa)', async () => {
      const token = 'valid_token_1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      mockUsers.push({
        id: 1,
        email: 'unverified@example.com',
        password_hash: 'hashed',
        is_active: false,
        activation_token: token,
        activation_token_expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000), // còn 2 giờ
      });

      const res = await request(app)
        .get(`/api/auth/verify-email?token=${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Kích hoạt tài khoản thành công');

      // User đã active, token đã null (NFR 2: single-use token)
      expect(mockUsers[0].is_active).toBe(true);
      expect(mockUsers[0].activation_token).toBeNull();
      expect(mockUsers[0].activation_token_expires_at).toBeNull();
    });

    test('NFR: Token chỉ được dùng 1 lần -> gọi lần 2 bị từ chối 400', async () => {
      // Giả sử token đã dùng nên không còn trong bảng
      const res = await request(app)
        .get('/api/auth/verify-email?token=already_used_token');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('không hợp lệ hoặc đã được sử dụng');
    });

    test('AC4: Liên kết đã quá 24 giờ -> thông báo hết hạn và cho phép yêu cầu gửi lại', async () => {
      const expiredToken = 'expired_token_abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      mockUsers.push({
        id: 2,
        email: 'expired@example.com',
        password_hash: 'hashed',
        is_active: false,
        activation_token: expiredToken,
        activation_token_expires_at: new Date(Date.now() - 60 * 1000), // đã hết hạn 1 phút trước
      });

      const res = await request(app)
        .get(`/api/auth/verify-email?token=${expiredToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.expired).toBe(true);
      expect(res.body.canResend).toBe(true);
      expect(res.body.message).toContain('hết hạn');
    });

    test('AC4: Gửi lại email kích hoạt (POST /resend-verification) thành công', async () => {
      mockUsers.push({
        id: 3,
        email: 'needresend@example.com',
        password_hash: 'hashed',
        is_active: false,
        activation_token: 'old_token',
        activation_token_expires_at: new Date(Date.now() - 1000),
      });

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: 'needresend@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Token mới được tạo
      expect(mockUsers[0].activation_token).not.toBe('old_token');
      expect(emailService.getSentEmails().length).toBe(1);
    });
  });

  describe('NFR — Giới hạn gửi lại email kích hoạt (Rate limiting: max 5 times/hour/email)', () => {
    test('Gửi lại email 5 lần thành công, lần thứ 6 bị chặn với HTTP 429 Too Many Requests', async () => {
      mockUsers.push({
        id: 4,
        email: 'spammer@example.com',
        password_hash: 'hashed',
        is_active: false,
      });

      // Giả lập đã có 5 request trong 1 giờ qua
      for (let i = 0; i < 5; i++) {
        mockVerificationRequests.push({
          id: i + 1,
          email: 'spammer@example.com',
          created_at: new Date(),
        });
      }

      // Lần thứ 6 -> vượt hạn mức
      const res = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: 'spammer@example.com' });

      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('tối đa 5 lần mỗi giờ');
    });
  });

  describe('AC5 — Đăng nhập bằng tài khoản chưa kích hoạt (Unverified account login)', () => {
    test('Đăng nhập tài khoản chưa active -> trả HTTP 403 Forbidden kèm hướng dẫn kích hoạt', async () => {
      const { hashPassword } = require('../src/utils/passwordHash');
      const hash = await hashPassword('ValidPass123!');

      mockUsers.push({
        id: 5,
        email: 'unverified_buyer@example.com',
        password_hash: hash,
        is_active: false, // chưa kích hoạt
        role_id: 3,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'unverified_buyer@example.com',
          password: 'ValidPass123!',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.needActivation).toBe(true);
      expect(res.body.message).toContain('Tài khoản chưa được kích hoạt');
    });
  });
});
