const { createMockPaymentGateway, readMockOrigin } = require('../src/payments/adapters/MockGateway');

const ORDER_ID = '33333333-3333-4333-8333-333333333333';
const secret = 'a-long-development-only-mock-secret-value';
const makeGateway = (overrides = {}) => createMockPaymentGateway({ secret,
  origin: 'https://staging.example.test', deployment: 'staging', ...overrides });

describe('T-44 mock gateway contract', () => {
  test('creates an HTTPS checkout and a result matching T-42', async () => {
    const gateway = makeGateway();
    const payment = await gateway.createPayment({ orderId: ORDER_ID, amountMinor: 275000, currency: 'VND' });
    expect(payment.gatewayRequestId).toBe(ORDER_ID);
    expect(payment.redirectUrl).toMatch(/^https:\/\/staging\.example\.test\/api\/payments\/mock\/checkout\?token=/);
    expect(payment.redirectUrl).not.toContain(secret);
    const token = new URL(payment.redirectUrl).searchParams.get('token');
    const signed = gateway.completeCheckout(token, 'succeeded');
    const verified = await gateway.verifyWebhook(signed);
    expect(await gateway.readResult(verified)).toMatchObject({
      orderId: ORDER_ID, gatewayRequestId: ORDER_ID, amountMinor: 275000, currency: 'VND', status: 'succeeded',
      providerEventId: expect.any(String), gatewayTransactionId: expect.any(String), occurredAt: expect.any(String),
    });
  });
  test('rejects invalid signatures, forged results and expired checkout tokens', async () => {
    let current = 1000;
    const gateway = makeGateway({ now: () => current });
    const payment = await gateway.createPayment({ orderId: ORDER_ID, amountMinor: 275000, currency: 'VND' });
    const token = new URL(payment.redirectUrl).searchParams.get('token');
    const signed = gateway.completeCheckout(token, 'failed');
    await expect(gateway.verifyWebhook({ ...signed, headers: { 'x-mock-signature': '0'.repeat(64) } }))
      .rejects.toThrow('signature');
    await expect(gateway.readResult({ payload: {} })).rejects.toThrow('not verified');
    current += 16 * 60 * 1000;
    expect(() => gateway.readCheckout(token)).toThrow('Expired');
  });
  test('requires backend-only secret and safe public origin', () => {
    expect(() => makeGateway({ secret: 'short' })).toThrow('32 bytes');
    expect(() => makeGateway({ deployment: 'production' })).toThrow('forbidden');
    expect(() => readMockOrigin('http://staging.example.test', 'staging')).toThrow('HTTPS');
    expect(() => readMockOrigin('https://evil.test/path', 'staging')).toThrow('HTTPS');
    expect(readMockOrigin('http://localhost:3000', 'development')).toBe('http://localhost:3000');
  });
});
