/**
 * SCRUM-72 [S-02 (T-07)] - Account Lockout After Failed Login Attempts
 * Test: sai 5 lần liên tiếp -> lần 6 bị khóa; sau 15 phút được thử lại.
 */

process.env.JWT_SECRET = 'test_secret_key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');

jest.mock('../src/models/User', () => ({
  findByEmail: jest.fn(),
  findById: jest.fn(),
  updateById: jest.fn(),
}));
jest.mock('../src/models/AuditLog', () => ({
  create: jest.fn().mockResolvedValue(1),
}));

const User = require('../src/models/User');

// Giả lập 1 "bản ghi user" sống trong bộ nhớ, updateById sẽ mutate object này,
// findByEmail sẽ luôn trả về trạng thái mới nhất -> mô phỏng đúng hành vi DB thật.
function makeInMemoryUser() {
  const record = {
    id: 42,
    email: 'lockme@test.com',
    password_hash: '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaA', // hash giả, luôn sai khi verify
    is_active: true,
    role: 'buyer',
    failed_login_attempts: 0,
    locked_until: null,
  };

  User.findByEmail.mockImplementation(async (email) =>
    email === record.email ? { ...record } : null
  );
  User.updateById.mockImplementation(async (id, data) => {
    if (id === record.id) Object.assign(record, data);
    return 1;
  });

  return record;
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('Account lockout (T-07)', () => {
  test('Sai 5 lần liên tiếp → lần thứ 6 bị khóa (423)', async () => {
    const record = makeInMemoryUser();

    // 5 lần sai liên tiếp -> TẤT CẢ đều là 401 (bản thân lần sai thứ 5 chưa bị khóa,
    // nó chỉ là nguyên nhân khiến tài khoản CHUYỂN sang trạng thái khóa cho lần SAU)
    for (let i = 1; i <= 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: record.email, password: 'sai-mat-khau' });

      expect(res.status).toBe(401);
    }

    expect(record.failed_login_attempts).toBe(5);
    expect(record.locked_until).not.toBeNull();

    // Lần thử thứ 6 (dù nhập đúng mật khẩu cũng bị chặn vì đang khóa)
    const res6 = await request(app)
      .post('/api/auth/login')
      .send({ email: record.email, password: 'sai-mat-khau' });

    expect(res6.status).toBe(423);
    expect(res6.body.message).toMatch(/khóa/i);
  });

  test('Sau khi hết 15 phút khóa → được phép thử lại (bộ đếm reset về 0)', async () => {
    const record = makeInMemoryUser();
    // Giả lập tài khoản đã bị khóa nhưng thời điểm khóa đã ở QUÁ KHỨ (hết hạn)
    record.failed_login_attempts = 5;
    record.locked_until = new Date(Date.now() - 1000); // đã hết hạn 1 giây trước

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: record.email, password: 'sai-mat-khau' });

    // Không còn bị khóa nữa -> request được xử lý như đăng nhập sai bình thường (401),
    // KHÔNG phải 423
    expect(res.status).toBe(401);

    // Bộ đếm phải được reset về 0 rồi mới tăng lên 1 cho lần thử này
    expect(record.locked_until).toBeNull();
    expect(record.failed_login_attempts).toBe(1);
  });
});
