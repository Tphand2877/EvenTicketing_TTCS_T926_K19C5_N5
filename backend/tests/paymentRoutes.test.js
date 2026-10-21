process.env.JWT_SECRET = 't41-test-only-secret';

jest.mock('../src/models/Order', () => ({
  findById: jest.fn(),
  claimPaymentRequest: jest.fn(),
  storePaymentUrl: jest.fn(),
  markPaymentRequestIndeterminate: jest.fn(),
  getOrderDetails: jest.fn(),
  createOrderFromHold: jest.fn(),
}));
jest.mock('../src/payments/createPaymentGateway', () => ({
  createPaymentGateway: jest.fn(),
}));
jest.mock('../src/middleware/auditLogger', () => ({
  auditAccessDenials: (_req, _res, next) => next(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const orders = require('../src/models/Order');
const { createPaymentGateway } = require('../src/payments/createPaymentGateway');

const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const auth = `Bearer ${jwt.sign({ userId: 7, role: 'buyer' }, process.env.JWT_SECRET)}`;
let orderFixture;
const gateway = {
  createPayment: jest.fn(),
  verifyWebhook: jest.fn(),
  readResult: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.PAYMENT_PROVIDER = 'momo';
  createPaymentGateway.mockReturnValue(gateway);
  orderFixture = {
    id: ORDER_ID,
    user_id: 7,
    status: 'pending',
    total_amount: 200000,
    currency: 'VND',
    expires_at: new Date(Date.now() + 60000),
    database_now: new Date(),
    updated_at: new Date(),
    gateway_provider: null,
    gateway_request_id: null,
    payment_url: null,
    payment_request_status: null,
    payment_request_started_at: null,
    payment_error_code: null,
  };
  orders.findById.mockImplementation(async () => ({ ...orderFixture }));
  orders.claimPaymentRequest.mockImplementation(async ({ provider, orderId }) => {
    if (orderFixture.gateway_request_id) return false;
    orderFixture.gateway_provider = provider;
    orderFixture.gateway_request_id = orderId;
    orderFixture.payment_request_status = 'processing';
    orderFixture.payment_request_started_at = new Date();
    return true;
  });
  orders.storePaymentUrl.mockImplementation(async ({ redirectUrl }) => {
    orderFixture.payment_url = redirectUrl;
    orderFixture.payment_request_status = 'ready';
    return true;
  });
  orders.markPaymentRequestIndeterminate.mockImplementation(async ({ errorCode }) => {
    orderFixture.payment_request_status = 'indeterminate';
    orderFixture.payment_error_code = errorCode;
    return true;
  });
  gateway.createPayment.mockResolvedValue({
    redirectUrl: 'https://test-payment.momo.vn/v2/gateway/pay?token=test',
    gatewayRequestId: ORDER_ID,
  });
});

test('POST /api/payments/orders/:orderId returns the authenticated buyer a provider URL', async () => {
  const response = await request(app)
    .post(`/api/payments/orders/${ORDER_ID}`)
    .set('Authorization', auth)
    .send({ amountMinor: 1 });

  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body.data.payment).toMatchObject({
    status: 'ready',
    orderId: ORDER_ID,
    amountMinor: 200000,
    currency: 'VND',
    redirectUrl: 'https://test-payment.momo.vn/v2/gateway/pay?token=test',
  });
  expect(gateway.createPayment).toHaveBeenCalledWith(expect.objectContaining({
    orderId: ORDER_ID,
    amountMinor: 200000,
  }));
});

test('an already claimed order returns 202 processing without contacting the gateway', async () => {
  orders.findById.mockResolvedValueOnce({
    id: ORDER_ID,
    user_id: 7,
    status: 'pending',
    total_amount: 200000,
    currency: 'VND',
    expires_at: new Date(Date.now() + 60000),
    database_now: new Date(),
    updated_at: new Date(),
    gateway_provider: 'momo',
    gateway_request_id: ORDER_ID,
    payment_request_status: 'processing',
    payment_request_started_at: new Date(),
    payment_url: null,
  });

  const response = await request(app).post(`/api/payments/orders/${ORDER_ID}`).set('Authorization', auth);

  expect(response.status).toBe(202);
  expect(response.body.data.payment).toMatchObject({ status: 'processing', gatewayRequestId: ORDER_ID });
  expect(response.headers['retry-after']).toBe('3');
  expect(response.body.data.payment.redirectUrl).toBeUndefined();
  expect(gateway.createPayment).not.toHaveBeenCalled();
});

test('GET payment status recovers a persisted redirect URL after reload', async () => {
  orders.findById.mockResolvedValueOnce({
    ...orderFixture,
    gateway_provider: 'momo',
    gateway_request_id: ORDER_ID,
    payment_request_status: 'ready',
    payment_url: 'https://test-payment.momo.vn/v2/gateway/pay?token=saved',
  });

  const response = await request(app)
    .get(`/api/payments/orders/${ORDER_ID}`)
    .set('Authorization', auth);

  expect(response.status).toBe(200);
  expect(response.body.data.payment).toMatchObject({
    status: 'ready',
    gatewayRequestId: ORDER_ID,
    redirectUrl: 'https://test-payment.momo.vn/v2/gateway/pay?token=saved',
  });
  expect(gateway.createPayment).not.toHaveBeenCalled();
});

test('return query parameters cannot claim payment success', async () => {
  const response = await request(app)
    .get(`/api/payments/orders/${ORDER_ID}?status=success&resultCode=0&transId=forged`)
    .set('Authorization', auth);

  expect(response.status).toBe(200);
  expect(response.body.data.payment).toEqual({ status: 'not_started', orderId: ORDER_ID });
  expect(gateway.createPayment).not.toHaveBeenCalled();
});

test.each([
  ['paid', 'paid'],
  ['needs_review', 'needs_review'],
  ['expired', 'expired'],
  ['cancelled', 'cancelled'],
])('GET payment status exposes persisted %s state to the return page', async (orderStatus, expectedStatus) => {
  orders.findById.mockResolvedValueOnce({
    ...orderFixture,
    status: orderStatus,
  });

  const response = await request(app)
    .get(`/api/payments/orders/${ORDER_ID}`)
    .set('Authorization', auth);

  expect(response.status).toBe(200);
  expect(response.body.data.payment.status).toBe(expectedStatus);
  expect(gateway.createPayment).not.toHaveBeenCalled();
});

test.each([
  {
    gatewayResult: "failed",
    expectedStatus: "failed",
    expectedHttpStatus: 200
  },
  {
    gatewayResult: "pending",
    expectedStatus: "processing",
    expectedHttpStatus: 202
  }
])('GET payment status reports a persisted gateway $gatewayResult result', async ({gatewayResult: gatewayResultStatus,
  expectedStatus,
  expectedHttpStatus})  => {
  orders.findById.mockResolvedValueOnce({
    ...orderFixture,
    gateway_provider: 'momo',
    gateway_request_id: ORDER_ID,
    gateway_result_status: gatewayResultStatus,
  });

  const response = await request(app)
    .get(`/api/payments/orders/${ORDER_ID}`)
    .set('Authorization', auth);

  expect(response.status).toBe(expectedHttpStatus);
  expect(response.body.data.payment.status).toBe(expectedStatus);
  expect(gateway.createPayment).not.toHaveBeenCalled();
});

test('GET payment status returns a machine-readable reconciliation error for a stuck claim', async () => {
  orders.findById.mockResolvedValueOnce({
    ...orderFixture,
    gateway_provider: 'momo',
    gateway_request_id: ORDER_ID,
    payment_request_status: 'indeterminate',
    payment_request_started_at: new Date(Date.now() - 300000),
  });

  const response = await request(app)
    .get(`/api/payments/orders/${ORDER_ID}`)
    .set('Authorization', auth);

  expect(response.status).toBe(409);
  expect(response.body).toMatchObject({
    success: false,
    code: 'PAYMENT_RECONCILIATION_REQUIRED',
    details: { orderId: ORDER_ID, gatewayRequestId: ORDER_ID, status: 'indeterminate' },
  });
  expect(gateway.createPayment).not.toHaveBeenCalled();
});

test('a gateway timeout returns an error code and request ID for reconciliation', async () => {
  gateway.createPayment.mockRejectedValueOnce(new Error('timeout'));

  const response = await request(app)
    .post(`/api/payments/orders/${ORDER_ID}`)
    .set('Authorization', auth);

  expect(response.status).toBe(502);
  expect(response.body).toMatchObject({
    success: false,
    code: 'PAYMENT_GATEWAY_UNAVAILABLE',
    details: { orderId: ORDER_ID, gatewayRequestId: ORDER_ID, status: 'indeterminate' },
  });
  expect(response.headers['cache-control']).toBe('no-store');
});

test('an unexpected persistence error has a stable generic API code', async () => {
  orders.findById.mockRejectedValueOnce(new Error('database details must stay private'));

  const response = await request(app)
    .post(`/api/payments/orders/${ORDER_ID}`)
    .set('Authorization', auth);

  expect(response.status).toBe(500);
  expect(response.body).toMatchObject({ success: false, code: 'PAYMENT_INTERNAL_ERROR' });
  expect(response.body.message).not.toContain('database details');
  expect(response.headers['cache-control']).toBe('no-store');
});

test('an already claimed but expired order returns 409 without contacting the gateway', async () => {
  orders.findById.mockResolvedValueOnce({
    id: ORDER_ID,
    user_id: 7,
    status: 'pending',
    total_amount: 200000,
    currency: 'VND',
    expires_at: new Date(Date.now() - 1000),
    database_now: new Date(),
    gateway_provider: 'momo',
    gateway_request_id: ORDER_ID,
  });

  const response = await request(app).post(`/api/payments/orders/${ORDER_ID}`).set('Authorization', auth);

  expect(response.status).toBe(409);
  expect(response.body.code).toBe('ORDER_EXPIRED');
  expect(gateway.createPayment).not.toHaveBeenCalled();
});

test('an expired order returns 409 without contacting the gateway', async () => {
  orders.findById.mockResolvedValueOnce({
    id: ORDER_ID,
    user_id: 7,
    status: 'pending',
    total_amount: 200000,
    currency: 'VND',
    expires_at: new Date(Date.now() - 1000),
    database_now: new Date(),
  });

  const response = await request(app).post(`/api/payments/orders/${ORDER_ID}`).set('Authorization', auth);

  expect(response.status).toBe(409);
  expect(response.body.code).toBe('ORDER_EXPIRED');
  expect(gateway.createPayment).not.toHaveBeenCalled();
});

test('a paid order returns 409 without contacting the gateway', async () => {
  orders.findById.mockResolvedValueOnce({
    id: ORDER_ID,
    user_id: 7,
    status: 'paid',
    total_amount: 200000,
    currency: 'VND',
    expires_at: new Date(Date.now() + 60000),
    database_now: new Date(),
  });

  const response = await request(app).post(`/api/payments/orders/${ORDER_ID}`).set('Authorization', auth);

  expect(response.status).toBe(409);
  expect(gateway.createPayment).not.toHaveBeenCalled();
});

test('the endpoint requires authentication', async () => {
  const response = await request(app).post(`/api/payments/orders/${ORDER_ID}`);
  expect(response.status).toBe(401);
});
