/**
 * SCRUM-72 [S-02 (T-10)] - Audit Logging for Unauthorized Access Attempts
 */

process.env.JWT_SECRET = 'test_secret_key';

jest.mock('../src/models/AuditLog', () => ({
  create: jest.fn().mockResolvedValue(1),
}));

const express = require('express');
const request = require('supertest');
const AuditLog = require('../src/models/AuditLog');
const { auditAccessDenials, buildLogEntry } = require('../src/middleware/auditLogger');
const { createSecureRouter } = require('../src/middleware/secureRoute');

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(auditAccessDenials);

  const router = createSecureRouter();

  // Route không khai báo quyền -> sẽ bị deny-by-default (403) -> phải được audit log
  router.get('/secret', (req, res) => {
    res.json({ success: true });
  });

  // Route public trả về 200 -> KHÔNG được ghi audit log
  router.post('/login-fake', { public: true }, (req, res) => {
    res.status(200).json({ success: true });
  });

  app.use('/api', router);
  return app;
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('Audit logging cho các lần bị từ chối (T-10)', () => {
  test('Request bị 403 (deny-by-default) → được ghi vào audit_logs', async () => {
    const app = buildTestApp();

    const res = await request(app).get('/api/secret');
    expect(res.status).toBe(403);

    // res.on('finish') chạy bất đồng bộ ngay sau khi response được gửi -> đợi 1 tick
    await new Promise((resolve) => setImmediate(resolve));

    expect(AuditLog.create).toHaveBeenCalledTimes(1);
    const loggedEntry = AuditLog.create.mock.calls[0][0];

    expect(loggedEntry.status_code).toBe(403);
    expect(loggedEntry.method).toBe('GET');
    expect(loggedEntry.endpoint).toBe('/api/secret');
    expect(loggedEntry.reason).toEqual(expect.any(String));
  });

  test('Request thành công (200) → KHÔNG được ghi audit log', async () => {
    const app = buildTestApp();

    const res = await request(app).post('/api/login-fake').send({ email: 'a@b.com', password: '123456' });
    expect(res.status).toBe(200);

    await new Promise((resolve) => setImmediate(resolve));

    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  test('buildLogEntry() không bao giờ chứa các trường nhạy cảm (password, token, ...)', () => {
    const fakeReq = {
      method: 'POST',
      originalUrl: '/api/auth/login',
      user: { userId: 7 },
      ip: '127.0.0.1',
      body: { email: 'a@b.com', password: 'toi-la-mat-khau-bi-mat' }, // KHÔNG được đọc field này
    };

    const entry = buildLogEntry(fakeReq, 401, 'Sai mật khẩu');
    const serialized = JSON.stringify(entry).toLowerCase();

    expect(serialized).not.toContain('mat-khau-bi-mat');
    expect(entry).not.toHaveProperty('password');
    expect(entry).not.toHaveProperty('password_hash');
    expect(entry).not.toHaveProperty('body');
    expect(entry.user_id).toBe(7);
    expect(entry.ip_address).toBe('127.0.0.1');
    expect(entry.status_code).toBe(401);
  });
});
