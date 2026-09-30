/**
 * Test SCRUM-75: authMiddleware.js
 */

const jwt = require('jsonwebtoken');

// Set env trước khi require module
process.env.JWT_SECRET = 'test_secret_key';

const { authenticate } = require('../src/middleware/authMiddleware');

// Helper tạo mock req/res/next
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// ─── authenticate ─────────────────────────────────────────────────────────────
describe('authenticate middleware', () => {
  test('❌ Không có Authorization header → 401', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('❌ Header không có "Bearer" → 401', () => {
    const req = { headers: { authorization: 'InvalidToken abc' } };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('❌ Token hết hạn → 401', () => {
    const expiredToken = jwt.sign(
      { userId: 1, role: 'buyer' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' } // đã hết hạn
    );

    const req = { headers: { authorization: `Bearer ${expiredToken}` } };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('hết hạn') })
    );
  });

  test('✅ Token hợp lệ → gắn req.user và gọi next()', () => {
    const payload = { userId: 1, email: 'test@example.com', role: 'buyer' };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({ userId: 1, role: 'buyer' });
  });
});
