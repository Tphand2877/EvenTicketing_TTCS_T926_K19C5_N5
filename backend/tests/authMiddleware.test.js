/**
 * Test SCRUM-75: authMiddleware.js
 */

const jwt = require('jsonwebtoken');

// Set env trước khi require module
process.env.JWT_SECRET = 'test_secret_key';

// Mock User model để kiểm soát trạng thái DB trong unit tests
jest.mock('../src/models/User', () => ({
  findById: jest.fn(),
}));

const User = require('../src/models/User');
const { authenticate } = require('../src/middleware/authMiddleware');

// Helper tạo mock req/res/next
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  User.findById.mockResolvedValue({
    id: 1,
    email: 'test@example.com',
    role: 'buyer',
    is_active: true,
    deactivated_at: null,
  });
});

// ─── authenticate ─────────────────────────────────────────────────────────────
describe('authenticate middleware', () => {
  test('❌ Không có Authorization header → 401', async () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('❌ Header không có "Bearer" → 401', async () => {
    const req = { headers: { authorization: 'InvalidToken abc' } };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('❌ Token hết hạn → 401', async () => {
    const expiredToken = jwt.sign(
      { userId: 1, role: 'buyer' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' } // đã hết hạn
    );

    const req = { headers: { authorization: `Bearer ${expiredToken}` } };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('hết hạn') })
    );
  });

  test('✅ Token hợp lệ → gắn req.user và gọi next()', async () => {
    const payload = { userId: 1, email: 'test@example.com', role: 'buyer' };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({ userId: 1, role: 'buyer' });
  });

  test('✅ [S-28 AC2] Token cũ mang role organizer nhưng DB đã đổi sang ticket_checker → cập nhật role mới ngay lập tức không cần đăng xuất', async () => {
    const payload = { userId: 1, email: 'staff@test.com', role: 'organizer' };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    // DB trả role mới nhất là ticket_checker
    User.findById.mockResolvedValue({
      id: 1,
      email: 'staff@test.com',
      role: 'ticket_checker',
      is_active: true,
      deactivated_at: null,
    });

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.role).toBe('ticket_checker'); // Role mới có hiệu lực ngay
  });

  test('❌ [S-28 AC3] Tài khoản bị quản trị viên vô hiệu hóa → từ chối 403 kèm thông báo liên hệ quản trị', async () => {
    const payload = { userId: 5, email: 'deactivated@test.com', role: 'buyer' };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    // DB trả tài khoản bị vô hiệu hóa
    User.findById.mockResolvedValue({
      id: 5,
      email: 'deactivated@test.com',
      role: 'buyer',
      is_active: false,
      deactivated_at: new Date(),
    });

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('vô hiệu hóa'),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
