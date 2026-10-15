/**
 * SCRUM-212 [S-21] - Webhook có chữ ký sai bị từ chối
 * Subtasks:
 *   - [T-48] SCRUM-213: Kiểm chữ ký webhook trước khi đọc nội dung
 *   - [T-49] SCRUM-214: Ghi log lần từ chối kèm địa chỉ nguồn
 */

process.env.PAYMENT_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.JWT_SECRET = 'test_jwt_secret_key';

jest.mock('../src/models/AuditLog', () => ({
  create: jest.fn().mockResolvedValue(1),
}));

const request = require('supertest');
const crypto = require('crypto');
const app = require('../src/app');
const AuditLog = require('../src/models/AuditLog');
const {
  computeSignature,
  verifySignature,
  getClientIp,
} = require('../src/services/paymentService');

const SECRET = 'test-webhook-secret';

function createHmacSignature(rawString, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(Buffer.from(rawString, 'utf8')).digest('hex');
}

describe('SCRUM-212 [S-21]: Webhook có chữ ký sai bị từ chối', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('T-48: Kiểm chữ ký webhook trước khi đọc nội dung (SCRUM-213)', () => {
    test('1. Từ chối ngay với 401 khi request thiếu header X-Signature', async () => {
      const payload = JSON.stringify({
        orderId: 'ORD-12345',
        amount: 250000,
        status: 'SUCCESS',
      });

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Thiếu chữ ký webhook');
    });

    test('2. Từ chối ngay với 401 khi chữ ký sai', async () => {
      const payload = JSON.stringify({
        orderId: 'ORD-12345',
        amount: 250000,
        status: 'SUCCESS',
      });

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Signature', 'bad_signature_deadbeef1234567890abcdef')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Chữ ký webhook không hợp lệ');
    });

    test('3. Body hỏng/sai cú pháp JSON + chữ ký sai -> vẫn trả 401 (chứng minh kiểm tra chữ ký TRƯỚC KHI parse JSON)', async () => {
      // Nội dung hoàn toàn không phải JSON hợp lệ
      const malformedJson = '{ orderId: "ORD-BAD", broken_syntax: ';

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Signature', 'invalid_signature_hex_1234567890abcdef')
        .send(malformedJson);

      // Nếu Express parse JSON trước chữ ký -> sẽ văng lỗi SyntaxError 400
      // Vì ta kiểm tra chữ ký trước khi đọc nội dung -> kết quả PHẢI là 401
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Chữ ký webhook không hợp lệ');
    });

    test('4. Chữ ký hợp lệ nhưng nội dung JSON bị hỏng -> trả 400 (chứng minh thứ tự: ký hợp lệ mới parse nội dung)', async () => {
      const malformedJson = 'invalid non-json raw text content';
      const validSig = createHmacSignature(malformedJson);

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Signature', validSig)
        .send(malformedJson);

      // Chữ ký đúng nên vượt qua bước 1, sang bước 2 đọc nội dung thấy cú pháp hỏng -> 400
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Định dạng JSON không hợp lệ');
    });

    test('5. Chấp nhận request khi chữ ký hợp lệ và payload đúng', async () => {
      const payload = {
        transactionId: 'TXN-9999',
        orderId: 'ORD-77777',
        amount: 500000,
        status: 'SUCCESS',
      };
      const rawBody = JSON.stringify(payload);
      const validSig = createHmacSignature(rawBody);

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Signature', validSig)
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBe('ORD-77777');
      expect(res.body.data.status).toBe('SUCCESS');
      expect(res.body.data.amount).toBe(500000);
    });

    test('6. Hỗ trợ chữ ký có tiền tố sha256= (chuẩn GitHub/Stripe)', async () => {
      const payload = {
        orderId: 'ORD-PREFIX',
        amount: 100000,
        status: 'FAILED',
      };
      const rawBody = JSON.stringify(payload);
      const validSig = `sha256=${createHmacSignature(rawBody)}`;

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Signature', validSig)
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('FAILED');
    });
  });

  describe('T-49: Ghi log lần từ chối kèm địa chỉ nguồn (SCRUM-214)', () => {
    test('1. Ghi log vào audit_logs kèm địa chỉ IP nguồn khi thiếu chữ ký', async () => {
      const payload = JSON.stringify({ orderId: 'ORD-AUDIT-1' });

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(401);

      await new Promise((resolve) => setImmediate(resolve));

      expect(AuditLog.create).toHaveBeenCalled();
      const calls = AuditLog.create.mock.calls;
      const matchingEntry = calls.map((c) => c[0]).find((entry) => entry.endpoint === '/api/payments/webhook');

      expect(matchingEntry).toBeDefined();
      expect(matchingEntry.status_code).toBe(401);
      expect(matchingEntry.method).toBe('POST');
      expect(matchingEntry.endpoint).toBe('/api/payments/webhook');
      expect(matchingEntry.reason).toContain('Thiếu chữ ký webhook');
      expect(matchingEntry.ip_address).toBeDefined();
    });

    test('2. Ghi log kèm địa chỉ IP nguồn từ header X-Forwarded-For khi chữ ký sai', async () => {
      const sourceIp = '203.0.113.195';
      const payload = JSON.stringify({ orderId: 'ORD-AUDIT-2' });

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Signature', 'invalid_signature_mock_data')
        .set('X-Forwarded-For', `${sourceIp}, 10.0.0.1`)
        .send(payload);

      expect(res.status).toBe(401);

      await new Promise((resolve) => setImmediate(resolve));

      expect(AuditLog.create).toHaveBeenCalled();
      const calls = AuditLog.create.mock.calls;
      const matchingEntry = calls.map((c) => c[0]).find((entry) => entry.ip_address === sourceIp);

      expect(matchingEntry).toBeDefined();
      expect(matchingEntry.ip_address).toBe(sourceIp);
      expect(matchingEntry.status_code).toBe(401);
      expect(matchingEntry.reason).toContain('Chữ ký webhook không hợp lệ');
    });

    test('3. Request hợp lệ (200) -> KHÔNG ghi nhận log từ chối vào audit_logs', async () => {
      const payload = JSON.stringify({
        orderId: 'ORD-SUCCESS',
        amount: 300000,
        status: 'SUCCESS',
      });
      const signature = createHmacSignature(payload);

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Signature', signature)
        .send(payload);

      expect(res.status).toBe(200);

      await new Promise((resolve) => setImmediate(resolve));

      // Không có entry audit_logs nào ghi nhận việc bị từ chối
      const calls = AuditLog.create.mock.calls;
      const rejectionEntries = calls.filter((c) => c[0].endpoint === '/api/payments/webhook');
      expect(rejectionEntries.length).toBe(0);
    });
  });

  describe('Đơn vị (Unit Tests) cho PaymentService & Timing Attacks', () => {
    test('verifySignature: chữ ký đúng trả về true', () => {
      const raw = 'test raw body string';
      const sig = computeSignature(raw, SECRET);
      expect(verifySignature(raw, sig, SECRET)).toBe(true);
    });

    test('verifySignature: chữ ký sai hoặc rỗng trả về false', () => {
      const raw = 'test raw body string';
      expect(verifySignature(raw, 'wrong', SECRET)).toBe(false);
      expect(verifySignature(raw, '', SECRET)).toBe(false);
      expect(verifySignature(raw, null, SECRET)).toBe(false);
    });

    test('verifySignature: sai khóa bí mật trả về false', () => {
      const raw = 'test raw body string';
      const sig = computeSignature(raw, 'another-secret');
      expect(verifySignature(raw, sig, SECRET)).toBe(false);
    });

    test('getClientIp trích xuất chính xác IP từ x-forwarded-for', () => {
      const fakeReq = {
        headers: { 'x-forwarded-for': '198.51.100.42, 10.0.0.1' },
      };
      expect(getClientIp(fakeReq)).toBe('198.51.100.42');
    });

    test('Payload thiếu orderId hoặc status trả về 400', async () => {
      const payload = JSON.stringify({ amount: 100000 }); // thiếu orderId, status
      const sig = createHmacSignature(payload);

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Signature', sig)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('thiếu orderId hoặc status');
    });
  });
});
