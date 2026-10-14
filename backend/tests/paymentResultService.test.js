const { createPaymentResultService } = require('../src/services/paymentResultService');

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-14T10:00:00.000Z');
const BASE_RESULT = {
  providerEventId: 'momo-event-001',
  orderId: ORDER_ID,
  gatewayRequestId: ORDER_ID,
  gatewayTransactionId: '987654321',
  amountMinor: 275000,
  currency: 'VND',
  status: 'succeeded',
  occurredAt: '2026-10-14T09:59:00.000Z',
};

const createFixture = ({ result = BASE_RESULT, order = {}, hold = {}, allocations = [{}], now = NOW } = {}) => {
  const state = {
    order: {
      id: ORDER_ID,
      user_id: 7,
      status: 'pending',
      total_amount: 275000,
      currency: 'VND',
      expires_at: new Date('2026-10-14T10:10:00.000Z'),
      gateway_provider: 'momo',
      gateway_request_id: ORDER_ID,
      gateway_transaction_id: null,
      gateway_result_status: null,
      payment_error_code: null,
      ...order,
    },
    hold: {
      id: 'hold-1',
      order_id: ORDER_ID,
      user_id: 7,
      showtime_id: 9,
      quantity: 1,
      status: 'pending_payment',
      expires_at: new Date('2026-10-14T10:10:00.000Z'),
      ...hold,
    },
    allocations: allocations.map((allocation, index) => ({
      id: index + 1,
      seatId: index + 1,
      releasedAt: null,
      showtimeId: 9,
      ...allocation,
    })),
    databaseNow: now,
  };
  const transaction = { id: 'shared-s20-transaction' };
  const repository = {
    withLockedOrder: jest.fn(async ({ operation }) => operation({
      transaction,
      order: { ...state.order },
      allocations: state.allocations.map((allocation) => ({ ...allocation })),
      hold: state.hold ? { ...state.hold } : null,
      databaseNow: state.databaseNow,
    })),
    markNeedsReview: jest.fn(async (_transaction, values) => {
      state.order.status = 'needs_review';
      state.order.gateway_transaction_id = values.gatewayTransactionId;
      state.order.gateway_result_status = 'succeeded';
      state.order.payment_error_code = values.errorCode;
    }),
    markPaid: jest.fn(async (_transaction, values) => {
      state.order.status = 'paid';
      state.order.gateway_transaction_id = values.gatewayTransactionId;
      state.order.gateway_result_status = 'succeeded';
    }),
    recordGatewayResult: jest.fn(async (_transaction, values) => {
      state.order.gateway_result_status = values.status;
    }),
    deletePaymentHold: jest.fn(async () => { state.hold = null; }),
  };
  const gateway = {
    verifyWebhook: jest.fn(async () => ({ payload: { verified: true } })),
    readResult: jest.fn(async () => ({ ...result })),
  };
  const service = createPaymentResultService({
    repository,
    gatewayFactory: () => gateway,
    env: { PAYMENT_PROVIDER: 'momo' },
  });
  return { state, transaction, repository, gateway, service };
};

const verify = (service) => service.verifyWebhook({ rawBody: Buffer.from('signed payload'), headers: {} });

describe('T-42 payment result service', () => {
  test('verifies the raw webhook and atomically marks the order paid and releases its hold', async () => {
    const { state, transaction, repository, service } = createFixture();
    const verified = await verify(service);

    await expect(service.applyVerifiedResult(verified, { transaction })).resolves.toEqual({
      status: 'paid',
      orderId: ORDER_ID,
      gatewayTransactionId: '987654321',
    });

    expect(repository.withLockedOrder).toHaveBeenCalledWith(expect.objectContaining({ transaction, orderId: ORDER_ID }));
    expect(repository.markPaid).toHaveBeenCalledWith(transaction, {
      orderId: ORDER_ID,
      gatewayTransactionId: '987654321',
    });
    expect(repository.deletePaymentHold).toHaveBeenCalledWith(transaction, expect.any(Object));
    expect(repository.recordGatewayResult).toHaveBeenCalledWith(transaction, {
      orderId: ORDER_ID,
      status: 'succeeded',
    });
    expect(state.order.status).toBe('paid');
    expect(state.hold).toBeNull();
  });

  test('does not apply an unverified client constructed result', async () => {
    const { repository, service } = createFixture();

    await expect(service.applyVerifiedResult(BASE_RESULT)).rejects.toMatchObject({
      code: 'PAYMENT_RESULT_UNVERIFIED',
    });
    expect(repository.withLockedOrder).not.toHaveBeenCalled();
  });

  test('rejects an invalid provider signature before opening the order transaction', async () => {
    const { gateway, repository, service } = createFixture();
    gateway.verifyWebhook.mockRejectedValueOnce(Object.assign(new Error('invalid signature'), { code: 'INVALID_SIGNATURE' }));

    await expect(verify(service)).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
    expect(gateway.readResult).not.toHaveBeenCalled();
    expect(repository.withLockedOrder).not.toHaveBeenCalled();
  });

  test.each([
    [{ gatewayRequestId: '22222222-2222-4222-8222-222222222222' }, 'PAYMENT_RESULT_INVALID'],
    [{ gatewayTransactionId: null }, 'PAYMENT_TRANSACTION_ID_INVALID'],
    [{ gatewayTransactionId: 'bad transaction id' }, 'PAYMENT_TRANSACTION_ID_INVALID'],
    [{ providerEventId: '' }, 'PAYMENT_RESULT_INVALID'],
    [{ currency: 'usd' }, 'PAYMENT_RESULT_INVALID'],
    [{ amountMinor: Number.MAX_SAFE_INTEGER + 1 }, 'PAYMENT_RESULT_INVALID'],
    [{ occurredAt: 'not-a-date' }, 'PAYMENT_RESULT_INVALID'],
  ])('rejects malformed or mismatched normalized provider data (%s)', async (overrides, code) => {
    const { repository, service } = createFixture({ result: { ...BASE_RESULT, ...overrides } });

    await expect(verify(service)).rejects.toMatchObject({ code });
    expect(repository.withLockedOrder).not.toHaveBeenCalled();
  });

  test('a successful payment with the wrong amount becomes NeedsReview and keeps the hold', async () => {
    const { state, repository, service } = createFixture({ result: { ...BASE_RESULT, amountMinor: 275001 } });
    const verified = await verify(service);

    await expect(service.applyVerifiedResult(verified)).resolves.toMatchObject({
      status: 'needs_review',
      reason: 'PAYMENT_AMOUNT_MISMATCH',
    });
    expect(repository.markNeedsReview).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      errorCode: 'PAYMENT_AMOUNT_MISMATCH',
    }));
    expect(repository.markPaid).not.toHaveBeenCalled();
    expect(repository.deletePaymentHold).not.toHaveBeenCalled();
    expect(state.order.status).toBe('needs_review');
    expect(state.hold).not.toBeNull();
  });

  test('a successful payment with the wrong currency becomes NeedsReview without selling seats', async () => {
    const { repository, service } = createFixture({ result: { ...BASE_RESULT, currency: 'USD' } });
    const verified = await verify(service);

    await expect(service.applyVerifiedResult(verified)).resolves.toMatchObject({
      status: 'needs_review',
      reason: 'PAYMENT_CURRENCY_MISMATCH',
    });
    expect(repository.markPaid).not.toHaveBeenCalled();
    expect(repository.deletePaymentHold).not.toHaveBeenCalled();
  });

  test.each(['failed', 'pending'])('a %s gateway result does not mark the order paid', async (status) => {
    const { state, repository, service } = createFixture({
      result: { ...BASE_RESULT, status, gatewayTransactionId: null },
    });
    const verified = await verify(service);

    await expect(service.applyVerifiedResult(verified)).resolves.toMatchObject({
      status: status === 'failed' ? 'failed' : 'processing',
    });
    expect(state.order.status).toBe('pending');
    expect(repository.markPaid).not.toHaveBeenCalled();
    expect(repository.deletePaymentHold).not.toHaveBeenCalled();
    expect(repository.recordGatewayResult).toHaveBeenCalledWith(expect.any(Object), {
      orderId: ORDER_ID,
      status,
    });
    expect(state.order.gateway_result_status).toBe(status);
    expect(state.order.status).toBe('pending');
    expect(state.hold).not.toBeNull();
  });

  test.each(['cancelled', 'expired'])('a late success for a %s order becomes NeedsReview', async (status) => {
    const { state, repository, service } = createFixture({ order: { status } });
    const verified = await verify(service);

    await expect(service.applyVerifiedResult(verified)).resolves.toMatchObject({
      status: 'needs_review',
      reason: 'LATE_PAYMENT_SUCCESS',
    });
    expect(state.order.status).toBe('needs_review');
    expect(repository.markPaid).not.toHaveBeenCalled();
    expect(repository.deletePaymentHold).not.toHaveBeenCalled();
  });

  test('a pending order that expires during result handling becomes NeedsReview', async () => {
    const { repository, service } = createFixture({
      order: { expires_at: new Date('2026-10-14T09:59:59.000Z') },
    });
    const verified = await verify(service);

    await expect(service.applyVerifiedResult(verified)).resolves.toMatchObject({
      status: 'needs_review',
      reason: 'LATE_PAYMENT_SUCCESS',
    });
    expect(repository.deletePaymentHold).not.toHaveBeenCalled();
  });

  test('an invalid hold or released seat allocation becomes NeedsReview', async () => {
    const { repository, service } = createFixture({
      hold: { quantity: 2 },
      allocations: [{ releasedAt: new Date('2026-10-14T09:50:00.000Z') }],
    });
    const verified = await verify(service);

    await expect(service.applyVerifiedResult(verified)).resolves.toMatchObject({
      status: 'needs_review',
      reason: 'PAYMENT_ALLOCATION_MISMATCH',
    });
    expect(repository.markPaid).not.toHaveBeenCalled();
    expect(repository.deletePaymentHold).not.toHaveBeenCalled();
  });

  test('the same transaction for a paid order is idempotent', async () => {
    const { repository, service } = createFixture({
      order: { status: 'paid', gateway_transaction_id: '987654321' },
    });
    const verified = await verify(service);

    await expect(service.applyVerifiedResult(verified)).resolves.toMatchObject({ status: 'duplicate' });
    expect(repository.markPaid).not.toHaveBeenCalled();
    expect(repository.deletePaymentHold).not.toHaveBeenCalled();
  });

  test('a different transaction for a paid order is reported as an anomaly', async () => {
    const { repository, service } = createFixture({
      order: { status: 'paid', gateway_transaction_id: '111111' },
      result: { ...BASE_RESULT, gatewayTransactionId: '222222' },
    });
    const verified = await verify(service);

    await expect(service.applyVerifiedResult(verified)).resolves.toMatchObject({
      status: 'anomaly',
      reason: 'DIFFERENT_TRANSACTION_FOR_PAID_ORDER',
    });
    expect(repository.markPaid).not.toHaveBeenCalled();
    expect(repository.deletePaymentHold).not.toHaveBeenCalled();
  });

  test('NeedsReview never transitions automatically to Paid', async () => {
    const { repository, service } = createFixture({
      order: { status: 'needs_review', payment_error_code: 'PAYMENT_AMOUNT_MISMATCH' },
    });
    const verified = await verify(service);

    await expect(service.applyVerifiedResult(verified)).resolves.toMatchObject({ status: 'needs_review' });
    expect(repository.markPaid).not.toHaveBeenCalled();
  });

  test('the gateway request ID must match the locked order claim', async () => {
    const { repository, service } = createFixture();
    const verified = await verify(service);
    const otherOrder = '22222222-2222-4222-8222-222222222222';
    repository.withLockedOrder.mockImplementationOnce(async ({ operation }) => operation({
      transaction: {},
      order: { id: ORDER_ID, gateway_provider: 'momo', gateway_request_id: otherOrder },
      allocations: [],
      hold: null,
      databaseNow: NOW,
    }));

    await expect(service.applyVerifiedResult(verified)).rejects.toMatchObject({
      code: 'PAYMENT_RESULT_CORRELATION_INVALID',
    });
    expect(repository.markPaid).not.toHaveBeenCalled();
  });
});
