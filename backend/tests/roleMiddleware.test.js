/**
 * Test SCRUM-75: roleMiddleware.js
 */

const { authorize } = require('../src/middleware/roleMiddleware');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// ─── authorize ────────────────────────────────────────────────────────────────
describe('authorize middleware', () => {
  test('❌ Không có req.user → 401', () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    authorize('admin')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('❌ Role không được phép → 403', () => {
    const req = { user: { userId: 2, role: 'buyer' } };
    const res = mockRes();
    const next = jest.fn();

    authorize('admin')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('✅ Role đúng → gọi next()', () => {
    const req = { user: { userId: 3, role: 'organizer' } };
    const res = mockRes();
    const next = jest.fn();

    authorize('admin', 'organizer')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
