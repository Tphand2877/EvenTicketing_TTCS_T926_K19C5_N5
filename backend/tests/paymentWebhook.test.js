const express = require('express');
const request = require('supertest');
const { createPaymentWebhookService, PaymentWebhookError } = require('../src/services/paymentWebhookService');
const { createPaymentWebhookRouter } = require('../src/routes/paymentWebhookRoutes');
const verifiedResult = Object.freeze({ gatewayTransactionId: 'transaction-1', providerEventId: 'event-1',
  orderId: '46000000-0000-4000-8000-000000000001', status: 'succeeded' });
const rawPayload = '{  "amount": 100000  }';
const transaction = {};
// S-27: bộ gửi email vé chạy sau khi webhook commit; ở đây chỉ kiểm nó được gọi sau khi xử lý thành công
const ticketEmails = { dispatchOrder: jest.fn().mockResolvedValue(true) };
const fixture = () => {
  const repository = { processOnce: jest.fn(async (_input, process) => ({ duplicate: false, ...await process(transaction) })) };
  const paymentResults = { applyVerifiedResult: jest.fn().mockResolvedValue({ status: 'paid' }), verifyWebhook: jest.fn().mockResolvedValue(verifiedResult) };
  return { repository, paymentResults, service: createPaymentWebhookService({ repository, paymentResults }) };
};
const appWith = ({ paymentResults, service }) => {
  const app = express();
  app.use(express.json({ verify(req, _res, body) { req.rawBody = Buffer.from(body); } }));
  app.use('/api/payments', createPaymentWebhookRouter({ paymentResults, service, ticketEmails }));
  return app;
};
test('T-46 passes the original T-42 verification token and the receipt transaction unchanged', async () => {
  const { service, repository, paymentResults } = fixture();
  expect(await service.handle({ verifiedResult, rawPayload })).toMatchObject({ duplicate: false, outcome: 'processed' });
  expect(repository.processOnce).toHaveBeenCalledWith({ transactionId: 'transaction-1', orderId: verifiedResult.orderId, rawPayload }, expect.any(Function));
  expect(paymentResults.applyVerifiedResult.mock.calls[0][0]).toBe(verifiedResult);
  expect(paymentResults.applyVerifiedResult).toHaveBeenCalledWith(verifiedResult, { transaction });
});
test('Duplicate short-circuits before calling any T-42 business logic', async () => {
  const { repository, service, paymentResults } = fixture();
  repository.processOnce.mockResolvedValue({ duplicate: true });
  expect(await service.handle({ verifiedResult, rawPayload })).toEqual({ duplicate: true });
  expect(paymentResults.applyVerifiedResult).not.toHaveBeenCalled();
});
test('A gateway result without a transaction ID uses T-42 stable provider event ID', async () => {
  const { repository, service } = fixture();
  await service.handle({ verifiedResult: { ...verifiedResult, gatewayTransactionId: null }, rawPayload });
  expect(repository.processOnce).toHaveBeenCalledWith(expect.objectContaining({ transactionId: 'event-1' }), expect.any(Function));
});
test.each([
  [{ status: 'needs_review', reason: 'LATE_PAYMENT_SUCCESS' }, 'refund_review'],
  [{ status: 'needs_review', reason: 'PAYMENT_AMOUNT_MISMATCH' }, 'needs_review'],
  [{ status: 'anomaly', reason: 'DIFFERENT_TRANSACTION_FOR_PAID_ORDER' }, 'needs_review'],
  [{ status: 'failed' }, 'processed'], [{ status: 'processing' }, 'processed'],
])('T-46 records T-42 outcome %j without implementing order/seat/payment mutations', async (result, outcome) => {
  const { service, paymentResults } = fixture();
  paymentResults.applyVerifiedResult.mockResolvedValue(result);
  expect(await service.handle({ verifiedResult, rawPayload })).toMatchObject({ outcome });
});
test('T-42 failure propagates through the repository transaction for retry', async () => {
  const { service, paymentResults } = fixture();
  paymentResults.applyVerifiedResult.mockRejectedValue(new Error('database failure'));
  await expect(service.handle({ verifiedResult, rawPayload })).rejects.toThrow();
});
test('Unexpected T-42 outcome is not recorded as processed', async () => {
  const { service, paymentResults } = fixture();
  paymentResults.applyVerifiedResult.mockResolvedValue({ status: 'unexpected' });
  await expect(service.handle({ verifiedResult, rawPayload })).rejects.toThrow();
});
test.each(['card_number', 'cardNumber', 'vnp_CardNumber', 'PAN', 'cvv', 'cvc'])('T-45 rejects raw card field %s before storage', async (field) => {
  const { repository, service } = fixture();
  await expect(service.handle({ verifiedResult, rawPayload: JSON.stringify({ nested: [{ [field]: 'private' }] }) }))
    .rejects.toMatchObject({ code: 'CARD_DATA_NOT_ALLOWED' });
  expect(repository.processOnce).not.toHaveBeenCalled();
});
test.each(['{bad', '[]', 'null', JSON.stringify({ x: 'a'.repeat(65536) })])('Invalid raw payload fails before claiming a transaction', async (rawPayload) => {
  const { repository, service } = fixture();
  await expect(service.handle({ verifiedResult, rawPayload })).rejects.toBeInstanceOf(PaymentWebhookError);
  expect(repository.processOnce).not.toHaveBeenCalled();
});
test('Route delegates exact-byte verification to T-42 even for duplicates and ACKs after processing', async () => {
  const f = fixture();
  f.repository.processOnce.mockResolvedValueOnce({ duplicate: false }).mockResolvedValueOnce({ duplicate: true });
  const app = appWith(f);
  for (let i = 0; i < 2; i += 1) expect((await request(app).post('/api/payments/webhook').type('json').send(rawPayload)).body).toEqual({ success: true });
  expect(f.paymentResults.verifyWebhook).toHaveBeenCalledTimes(2);
  expect(f.paymentResults.verifyWebhook).toHaveBeenCalledWith(expect.objectContaining({ rawBody: Buffer.from(rawPayload) }));
  expect(ticketEmails.dispatchOrder).toHaveBeenLastCalledWith(verifiedResult.orderId); // S-27: sau khi commit
});
test('A T-42 signature rejection never reaches receipt handling', async () => {
  ticketEmails.dispatchOrder.mockClear();
  const f = fixture();
  f.paymentResults.verifyWebhook.mockRejectedValue(new Error('signature invalid'));
  expect((await request(appWith(f)).post('/api/payments/webhook').type('json').send(rawPayload)).status).toBe(401);
  expect(f.repository.processOnce).not.toHaveBeenCalled();
  expect(ticketEmails.dispatchOrder).not.toHaveBeenCalled();
});
test('Route rejects unsupported media/oversize raw bodies and hides processing errors', async () => {
  const f = fixture();
  const app = appWith(f);
  expect((await request(app).post('/api/payments/webhook').type('text').send('private')).status).toBe(415);
  expect((await request(app).post('/api/payments/webhook').type('json').send(JSON.stringify({ x: 'a'.repeat(65536) }))).status).toBe(413);
  f.service.handle = jest.fn().mockRejectedValue(new Error('private order payment data'));
  ticketEmails.dispatchOrder.mockClear();
  const logger = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect((await request(app).post('/api/payments/webhook').type('json').send(rawPayload)).status).toBe(500);
    expect(logger.mock.calls).toEqual([['[PaymentWebhook] Processing failed.']]);
    expect(ticketEmails.dispatchOrder).not.toHaveBeenCalled(); // xử lý lỗi (rollback) thì không gửi email
  } finally { logger.mockRestore(); }
});
test('Missing T-42 service cannot silently accept a payment', () => {
  expect(() => createPaymentWebhookService()).toThrow();
});
