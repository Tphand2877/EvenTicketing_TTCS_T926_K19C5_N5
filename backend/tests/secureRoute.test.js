/**
 * SCRUM-72 [S-02 (T-08)] - Deny Access by Default for Unregistered Routes
 */

process.env.JWT_SECRET = 'test_secret_key';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createSecureRouter } = require('../src/middleware/secureRoute');

function buildTestApp() {
  const app = express();
  app.use(express.json());

  const router = createSecureRouter();

  // Route giả KHÔNG khai báo quyền truy cập
  router.get('/no-policy-declared', (req, res) => {
    res.json({ success: true, message: 'Không nên bao giờ tới được đây!' });
  });

  // Route public (có khai báo rõ ràng)
  router.get('/public-info', { public: true }, (req, res) => {
    res.json({ success: true, message: 'ok' });
  });

  // Route yêu cầu role cụ thể
  router.get('/admin-only', { roles: ['admin'] }, (req, res) => {
    res.json({ success: true, message: 'admin ok' });
  });

  app.use('/test', router);
  return app;
}

describe('Deny by default cho route chưa khai báo quyền (T-08)', () => {
  const app = buildTestApp();

  test('Route KHÔNG khai báo policy → luôn bị từ chối (403), kể cả khi không có token', async () => {
    const res = await request(app).get('/test/no-policy-declared');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('Route KHÔNG khai báo policy → vẫn bị từ chối dù có gửi token hợp lệ', async () => {
    const token = jwt.sign({ userId: 1, role: 'admin' }, process.env.JWT_SECRET);

    const res = await request(app)
      .get('/test/no-policy-declared')
      .set('Authorization', `Bearer ${token}`);

    // Mặc định từ chối bất kể quyền của user - vì route này chưa được khai báo policy
    expect(res.status).toBe(403);
  });

  test('Route khai báo { public: true } → truy cập được không cần token', async () => {
    const res = await request(app).get('/test/public-info');
    expect(res.status).toBe(200);
  });

  test('Route khai báo { roles: ["admin"] } → user role khác bị chặn (403)', async () => {
    const token = jwt.sign({ userId: 2, role: 'buyer' }, process.env.JWT_SECRET);

    const res = await request(app)
      .get('/test/admin-only')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('Route khai báo { roles: ["admin"] } → admin truy cập được (200)', async () => {
    const token = jwt.sign({ userId: 3, role: 'admin' }, process.env.JWT_SECRET);

    const res = await request(app)
      .get('/test/admin-only')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
