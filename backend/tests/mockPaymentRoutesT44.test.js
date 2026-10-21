const express = require('express');
const request = require('supertest');
const { createMockPaymentGateway } = require('../src/payments/adapters/MockGateway');
const { createMockPaymentRouter } = require('../src/routes/mockPaymentRoutes');

const orderId = '33333333-3333-4333-8333-333333333333';
const gateway = createMockPaymentGateway({ deployment: 'test',
  secret: 'test-only-secret-with-at-least-thirty-two-bytes', origin: 'http://localhost:3000' });

const setup = () => {
  const paymentResultService = { verifyWebhook: jest.fn(async (signed) => gateway.readResult(
    await gateway.verifyWebhook(signed))), applyVerifiedResult: jest.fn(async () => ({ status: 'paid' })) };
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/payments/mock', createMockPaymentRouter({ gateway, paymentResultService }));
  return { app, paymentResultService };
};

test('server-side mock checkout signs and verifies before applying a result', async () => {
  const { app, paymentResultService } = setup();
  const payment = await gateway.createPayment({ orderId, amountMinor: 275000, currency: 'VND' });
  const token = new URL(payment.redirectUrl).searchParams.get('token');
  const page = await request(app).get(`/api/payments/mock/checkout?token=${token}`);
  expect(page.status).toBe(200);
  expect(page.text).toContain('275000 VND');
  expect(page.text).not.toContain('test-only-secret');
  const completion = await request(app).post('/api/payments/mock/complete').type('form')
    .send({ token, status: 'succeeded' });
  expect(completion.status).toBe(200);
  expect(paymentResultService.verifyWebhook).toHaveBeenCalledTimes(1);
  expect(paymentResultService.applyVerifiedResult).toHaveBeenCalledWith(expect.objectContaining({
    orderId, status: 'succeeded', gatewayRequestId: orderId,
  }));
});

test('forged token or status cannot settle an order', async () => {
  const { app, paymentResultService } = setup();
  expect((await request(app).get('/api/payments/mock/checkout?token=forged')).status).toBe(400);
  expect((await request(app).post('/api/payments/mock/complete').type('form')
    .send({ token: 'forged', status: 'succeeded' })).status).toBe(400);
  expect(paymentResultService.applyVerifiedResult).not.toHaveBeenCalled();
});
