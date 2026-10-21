const { createMockPaymentGateway } = require('../src/payments/adapters/MockGateway');
const { createPaymentResultService } = require('../src/services/paymentResultService');

const orderId = '33333333-3333-4333-8333-333333333333';
const gateway = createMockPaymentGateway({ deployment: 'test',
  secret: 'test-only-secret-with-at-least-thirty-two-bytes', origin: 'http://localhost:3000' });

const setup = () => {
  const state = { status: 'pending', transactionId: null, hold: { id: 'hold-1', order_id: orderId,
    user_id: 7, showtime_id: 9, quantity: 1, status: 'pending_payment', expires_at: '2099-01-01T00:00:00Z' } };
  const repository = {
    withLockedOrder: jest.fn(async ({ operation }) => operation({ transaction: {}, order: {
      id: orderId, user_id: 7, status: state.status, total_amount: 275000, currency: 'VND',
      expires_at: '2099-01-01T00:00:00Z', gateway_provider: 'mock', gateway_request_id: orderId,
      gateway_transaction_id: state.transactionId,
    }, allocations: [{ seatId: 1, showtimeId: 9, releasedAt: null }],
    hold: state.hold, databaseNow: new Date() })),
    recordGatewayResult: jest.fn(),
    markPaid: jest.fn(async (_trx, input) => { state.status = 'paid'; state.transactionId = input.gatewayTransactionId; }),
    markNeedsReview: jest.fn(async () => { state.status = 'needs_review'; }),
    deletePaymentHold: jest.fn(async () => { state.hold = null; }),
  };
  const service = createPaymentResultService({ repository, gateway,
    env: { DEPLOY_ENV: 'test', PAYMENT_PROVIDER: 'mock' } });
  return { state, service, repository };
};

test('real Mock signature passes T-42 and a duplicate cannot mark the order paid twice', async () => {
  const { state, service, repository } = setup();
  const payment = await gateway.createPayment({ orderId, amountMinor: 275000, currency: 'VND' });
  const signed = gateway.completeCheckout(new URL(payment.redirectUrl).searchParams.get('token'), 'succeeded');
  const first = await service.verifyWebhook(signed);
  await expect(service.applyVerifiedResult(first)).resolves.toMatchObject({ status: 'paid' });
  expect(state.status).toBe('paid');
  const duplicate = await service.verifyWebhook(signed);
  await expect(service.applyVerifiedResult(duplicate)).resolves.toMatchObject({ status: 'duplicate' });
  expect(repository.markPaid).toHaveBeenCalledTimes(1);
});

test('unsigned browser payload cannot reach T-42 settlement', async () => {
  const { service, repository } = setup();
  await expect(service.verifyWebhook({ rawBody: Buffer.from('{}'), headers: {} }))
    .rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
  expect(repository.withLockedOrder).not.toHaveBeenCalled();
});

test('a signed Mock result with the wrong amount goes to NeedsReview', async () => {
  const { state, service, repository } = setup();
  const payment = await gateway.createPayment({ orderId, amountMinor: 275001, currency: 'VND' });
  const signed = gateway.completeCheckout(new URL(payment.redirectUrl).searchParams.get('token'), 'succeeded');
  const verified = await service.verifyWebhook(signed);
  await expect(service.applyVerifiedResult(verified)).resolves.toMatchObject({
    status: 'needs_review', reason: 'PAYMENT_AMOUNT_MISMATCH',
  });
  expect(state.status).toBe('needs_review');
  expect(repository.markPaid).not.toHaveBeenCalled();
});

test('Mock failure keeps the order pending under T-42', async () => {
  const { state, service, repository } = setup();
  const payment = await gateway.createPayment({ orderId, amountMinor: 275000, currency: 'VND' });
  const signed = gateway.completeCheckout(new URL(payment.redirectUrl).searchParams.get('token'), 'failed');
  const verified = await service.verifyWebhook(signed);
  await expect(service.applyVerifiedResult(verified)).resolves.toMatchObject({ status: 'failed' });
  expect(state.status).toBe('pending');
  expect(repository.markPaid).not.toHaveBeenCalled();
});
