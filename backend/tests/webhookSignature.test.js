/**
 * SCRUM-212 [S-21] - Webhook có chữ ký sai bị từ chối
 *   - [T-48] SCRUM-213: Kiểm chữ ký webhook trước khi đọc nội dung
 *   - [T-49] SCRUM-214: Ghi log lần từ chối kèm địa chỉ nguồn
 *
 * Chạy app thật với adapter MoMo (T-40) qua route webhook (T-46). Mọi ca ở đây bị từ chối
 * trước khi chạm database; đường hợp lệ được kiểm trên DB thật ở webhookReplay.integration.test.js.
 */
process.env.JWT_SECRET = 's21-auth-test-only';
process.env.PAYMENT_PROVIDER = 'momo';
process.env.MOMO_PARTNER_CODE = 'S21TEST';
process.env.MOMO_ACCESS_KEY = 's21-access-key';
process.env.MOMO_SECRET_KEY = 's21-secret-key-test-only';
process.env.MOMO_REDIRECT_URL = 'http://localhost:8080/payment/return';
process.env.MOMO_IPN_URL = 'http://localhost:3000/api/payments/webhook';
delete process.env.TRUST_PROXY;

jest.mock('../src/models/AuditLog', () => ({ create: jest.fn().mockResolvedValue(1) }));

const crypto = require('crypto');
const request = require('supertest');
const AuditLog = require('../src/models/AuditLog');
const { createWebhookSignatureData, sign } = require('../src/payments/adapters/MoMoGateway');

const ORDER_ID = '21000000-0000-4000-8000-000000000001';
const ipn = (overrides = {}, secret = process.env.MOMO_SECRET_KEY) => {
  const payload = {
    partnerCode: process.env.MOMO_PARTNER_CODE, orderId: ORDER_ID, requestId: ORDER_ID, amount: 300000,
    orderInfo: 'Ve', orderType: 'momo_wallet', transId: 2100000001, resultCode: 0, message: 'Successful.',
    payType: 'qr', responseTime: 1792000000000, extraData: '',
  };
  payload.signature = sign(secret, createWebhookSignatureData(payload, process.env.MOMO_ACCESS_KEY));
  return { ...payload, ...overrides };
};
const post = (app, body, headers = {}) => request(app).post('/api/payments/webhook')
  .set('Content-Type', 'application/json').set(headers).send(typeof body === 'string' ? body : JSON.stringify(body));
// auditAccessDenials ghi log khi response kết thúc; chờ một nhịp để lời gọi ghi chạy xong
const logged = async (auditLog = AuditLog) => {
  await new Promise((resolve) => setImmediate(resolve));
  return auditLog.create.mock.calls.map(([entry]) => entry);
};
// Nạp một bản app riêng với biến môi trường khác (TRUST_PROXY đọc lúc nạp module)
const loadApp = (env) => {
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.entries(env).forEach(([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  let loaded;
  jest.isolateModules(() => { loaded = { app: require('../src/app'), auditLog: require('../src/models/AuditLog') }; });
  return { ...loaded, restore: () => Object.entries(saved).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }) };
};

describe('SCRUM-212 [S-21]: webhook có chữ ký sai bị từ chối', () => {
  const app = require('../src/app');
  beforeEach(() => jest.clearAllMocks());

  describe('T-48: kiểm chữ ký trước khi đọc nội dung', () => {
    test('Thiếu chữ ký -> 401', async () => {
      const { signature, ...unsigned } = ipn();
      expect(signature).toMatch(/^[a-f0-9]{64}$/);
      expect((await post(app, unsigned)).status).toBe(401);
    });

    test('Chữ ký sai; sửa số tiền nhưng giữ chữ ký cũ -> 401', async () => {
      expect((await post(app, ipn({ signature: 'f'.repeat(64) }))).status).toBe(401);
      expect((await post(app, ipn({ amount: 1000 }))).status).toBe(401);
    });

    test('Body JSON hỏng -> 401 của webhook, không phải 400 của bộ đọc JSON chung', async () => {
      const res = await post(app, '{"partnerCode": "S21TEST", "amount": ');
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toMatch(/JSON không hợp lệ|vị trí ký tự/);
    });

    test('Không có khoá mặc định: ký bằng "mock-secret" (kiểu X-Signature cũ) không qua được', async () => {
      const body = JSON.stringify({ orderId: ORDER_ID, status: 'SUCCESS', amount: 1 });
      const legacy = crypto.createHmac('sha256', 'mock-secret').update(body).digest('hex');
      expect((await post(app, body, { 'X-Signature': legacy })).status).toBe(401);
      expect((await post(app, ipn({}, 'mock-secret'))).status).toBe(401);
    });

    test('Thiếu cấu hình khoá của cổng -> mọi webhook bị từ chối, không có đường lui', async () => {
      const validIpn = ipn();
      const isolated = loadApp({ MOMO_SECRET_KEY: undefined });
      try {
        expect((await post(isolated.app, validIpn)).status).toBe(401);
      } finally {
        isolated.restore();
      }
    });
  });

  describe('T-49: ghi log lần từ chối kèm địa chỉ nguồn', () => {
    test('Mỗi lần từ chối ghi đúng một dòng: endpoint, 401, lý do, IP kết nối', async () => {
      await post(app, ipn({ signature: 'a'.repeat(64) }));
      const entries = await logged();

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        method: 'POST', endpoint: '/api/payments/webhook', status_code: 401, reason: 'Chữ ký webhook không hợp lệ',
      });
      expect(entries[0].ip_address).toMatch(/127\.0\.0\.1|::1/);
    });

    test('Chưa bật TRUST_PROXY: X-Forwarded-For do người gửi tự khai không được ghi làm IP nguồn', async () => {
      await post(app, ipn({ signature: 'b'.repeat(64) }), { 'X-Forwarded-For': '6.6.6.6' });
      const [entry] = await logged();
      expect(entry.ip_address).not.toBe('6.6.6.6');
      expect(entry.ip_address).toMatch(/127\.0\.0\.1|::1/);
    });

    test('Sau Nginx (TRUST_PROXY=1): lấy IP client do proxy thêm vào, bỏ phần người gửi tự khai', async () => {
      const proxied = loadApp({ TRUST_PROXY: '1' });
      proxied.restore();
      // Người gửi tự khai 6.6.6.6, Nginx nối thêm IP thật 203.0.113.9 vào cuối
      await post(proxied.app, ipn({ signature: 'c'.repeat(64) }), { 'X-Forwarded-For': '6.6.6.6, 203.0.113.9' });
      const [entry] = await logged(proxied.auditLog);
      expect(entry.ip_address).toBe('203.0.113.9');
    });
  });
});
