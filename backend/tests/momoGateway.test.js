const {
  createMoMoGateway,
  createRequestSignatureData,
  createResponseSignatureData,
  createWebhookSignatureData,
  sign,
} = require('../src/payments/adapters/MoMoGateway');
const { readMomoConfig } = require('../src/config/paymentGateway');

const SECRET = 'test-secret-key';
const ACCESS_KEY = 'test-access-key';
const ORDER_ID = 'order-9c5d2b36';
const config = {
  partnerCode: 'MOMOTEST',
  accessKey: ACCESS_KEY,
  secretKey: SECRET,
  apiBaseUrl: 'https://test-payment.momo.vn',
  redirectUrl: 'http://localhost:8080/payment/return',
  ipnUrl: 'https://example.test/api/payments/momo/webhook',
};

const signedWebhook = (overrides = {}) => {
  const payload = {
    orderType: 'momo_wallet',
    amount: 150000,
    partnerCode: config.partnerCode,
    orderId: ORDER_ID,
    extraData: '',
    transId: 123456789,
    responseTime: 1791900000000,
    resultCode: 0,
    message: 'Successful.',
    payType: 'qr',
    requestId: ORDER_ID,
    orderInfo: `Ticket order ${ORDER_ID}`,
    ...overrides,
  };
  payload.signature = sign(SECRET, createWebhookSignatureData(payload, ACCESS_KEY));
  return payload;
};

describe('MoMo sandbox adapter (T-40)', () => {
  test('creates a signed captureWallet request with the stable order ID as requestId', async () => {
    let sentRequest;
    const responsePayload = {
      partnerCode: config.partnerCode,
      orderId: ORDER_ID,
      requestId: ORDER_ID,
      amount: 150000,
      responseTime: 1791900000000,
      message: 'Successful.',
      resultCode: 0,
      payUrl: 'https://test-payment.momo.vn/v2/gateway/pay?token=test',
    };
    responsePayload.signature = sign(SECRET, createResponseSignatureData(responsePayload, ACCESS_KEY));
    const fetchImpl = jest.fn(async (_url, options) => {
      sentRequest = JSON.parse(options.body);
      return { ok: true, json: async () => responsePayload };
    });
    const gateway = createMoMoGateway({ config, fetchImpl });

    await expect(gateway.createPayment({
      orderId: ORDER_ID,
      amountMinor: 150000,
      currency: 'VND',
    })).resolves.toEqual({
      redirectUrl: responsePayload.payUrl,
      gatewayRequestId: ORDER_ID,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://test-payment.momo.vn/v2/gateway/api/create',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(sentRequest).toMatchObject({
      amount: 150000,
      orderId: ORDER_ID,
      requestId: ORDER_ID,
      requestType: 'captureWallet',
      autoCapture: true,
      partnerCode: config.partnerCode,
    });
    expect(sentRequest.signature).toBe(sign(SECRET, createRequestSignatureData({
      accessKey: ACCESS_KEY,
      amount: 150000,
      extraData: '',
      ipnUrl: config.ipnUrl,
      orderId: ORDER_ID,
      orderInfo: `Ticket order ${ORDER_ID}`,
      partnerCode: config.partnerCode,
      redirectUrl: config.redirectUrl,
      requestId: ORDER_ID,
    })));
  });

  test('rejects an invalid signed MoMo response and never returns its redirect URL', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        partnerCode: config.partnerCode,
        orderId: ORDER_ID,
        requestId: ORDER_ID,
        amount: 150000,
        responseTime: 1791900000000,
        message: 'Successful.',
        resultCode: 0,
        payUrl: 'https://test-payment.momo.vn/v2/gateway/pay?token=test',
        signature: '0'.repeat(64),
      }),
    }));
    const gateway = createMoMoGateway({ config, fetchImpl });

    await expect(gateway.createPayment({ orderId: ORDER_ID, amountMinor: 150000, currency: 'VND' }))
      .rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
  });

  test('rejects a signed response that points to a different payment host', async () => {
    const responsePayload = {
      partnerCode: config.partnerCode,
      orderId: ORDER_ID,
      requestId: ORDER_ID,
      amount: 150000,
      responseTime: 1791900000000,
      message: 'Successful.',
      resultCode: 0,
      payUrl: 'https://attacker.example/v2/gateway/pay?token=test',
    };
    responsePayload.signature = sign(SECRET, createResponseSignatureData(responsePayload, ACCESS_KEY));
    const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => responsePayload }));
    const gateway = createMoMoGateway({ config, fetchImpl });

    await expect(gateway.createPayment({ orderId: ORDER_ID, amountMinor: 150000, currency: 'VND' }))
      .rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
  });

  test('verifies a webhook and maps success to a provider-neutral result', async () => {
    const gateway = createMoMoGateway({ config, fetchImpl: jest.fn() });
    const verified = await gateway.verifyWebhook({ rawBody: Buffer.from(JSON.stringify(signedWebhook())), headers: {} });

    await expect(gateway.readResult(verified)).resolves.toEqual({
      providerEventId: '123456789',
      orderId: ORDER_ID,
      gatewayRequestId: ORDER_ID,
      gatewayTransactionId: '123456789',
      amountMinor: 150000,
      currency: 'VND',
      status: 'succeeded',
      occurredAt: new Date(1791900000000).toISOString(),
    });
  });

  test('rejects a modified webhook payload', async () => {
    const payload = signedWebhook({ amount: 200000 });
    payload.amount = 250000;
    const gateway = createMoMoGateway({ config, fetchImpl: jest.fn() });

    await expect(gateway.verifyWebhook({ rawBody: Buffer.from(JSON.stringify(payload)), headers: {} }))
      .rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
  });

  test('maps one-step authorization to success and non-final MoMo codes to pending', async () => {
    const gateway = createMoMoGateway({ config, fetchImpl: jest.fn() });
    const authorized = await gateway.verifyWebhook({
      rawBody: Buffer.from(JSON.stringify(signedWebhook({ resultCode: 9000 }))), headers: {},
    });
    await expect(gateway.readResult(authorized)).resolves.toMatchObject({ status: 'succeeded' });

    for (const resultCode of [1000, 7000, 7002]) {
      const pending = await gateway.verifyWebhook({
        rawBody: Buffer.from(JSON.stringify(signedWebhook({ resultCode }))), headers: {},
      });
      await expect(gateway.readResult(pending)).resolves.toMatchObject({ status: 'pending' });
    }

    const failed = await gateway.verifyWebhook({
      rawBody: Buffer.from(JSON.stringify(signedWebhook({ resultCode: 1006 }))), headers: {},
    });

    await expect(gateway.readResult(failed)).resolves.toMatchObject({ status: 'failed' });
  });

  test('rejects unsupported currency, unsafe order IDs, and amounts outside MoMo limits', async () => {
    const gateway = createMoMoGateway({ config, fetchImpl: jest.fn() });
    const invalidRequests = [
      { orderId: ORDER_ID, amountMinor: 150000, currency: 'USD' },
      { orderId: 'invalid id', amountMinor: 150000, currency: 'VND' },
      { orderId: ORDER_ID, amountMinor: 999, currency: 'VND' },
      { orderId: ORDER_ID, amountMinor: 50000001, currency: 'VND' },
    ];

    for (const input of invalidRequests) {
      await expect(gateway.createPayment(input)).rejects.toMatchObject({ code: 'INVALID_PAYMENT_REQUEST' });
    }
  });

  test('loads credentials from environment and requires HTTPS endpoints in production', () => {
    const env = {
      NODE_ENV: 'development',
      MOMO_PARTNER_CODE: config.partnerCode,
      MOMO_ACCESS_KEY: config.accessKey,
      MOMO_SECRET_KEY: config.secretKey,
      MOMO_REDIRECT_URL: config.redirectUrl,
      MOMO_IPN_URL: config.ipnUrl,
    };
    expect(readMomoConfig(env)).toMatchObject({
      partnerCode: config.partnerCode,
      accessKey: config.accessKey,
      apiBaseUrl: 'https://test-payment.momo.vn',
    });
    expect(() => readMomoConfig({
      ...env,
      NODE_ENV: 'production',
      MOMO_REDIRECT_URL: 'https://events.example.test/payment/return',
    }))
      .not.toThrow();
    expect(() => readMomoConfig({ ...env, NODE_ENV: 'production',  MOMO_REDIRECT_URL: 'https://example.com/return', MOMO_IPN_URL: 'http://localhost/webhook' }))
      .toThrow('Invalid payment gateway URL setting: MOMO_IPN_URL.');
    expect(() => readMomoConfig({ ...env, MOMO_API_BASE_URL: 'https://example.test' }))
      .toThrow('Invalid payment gateway URL setting: MOMO_API_BASE_URL.');
  });
});
