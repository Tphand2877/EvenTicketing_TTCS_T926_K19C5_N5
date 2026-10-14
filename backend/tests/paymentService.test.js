const { createPaymentService } = require('../src/services/paymentService');

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-14T10:00:00.000Z');

const createFixture = (overrides = {}) => {
  const order = {
    id: ORDER_ID,
    user_id: 7,
    status: 'pending',
    total_amount: 275000,
    currency: 'VND',
    expires_at: new Date('2026-10-14T10:10:00.000Z'),
    database_now: NOW,
    updated_at: NOW,
    gateway_provider: null,
    gateway_request_id: null,
    gateway_result_status: null,
    payment_url: null,
    payment_request_status: null,
    payment_request_started_at: null,
    payment_error_code: null,
    ...overrides,
  };
  const orders = {
    findById: jest.fn(async () => ({ ...order })),
    claimPaymentRequest: jest.fn(async ({ provider, orderId }) => {
      if (order.gateway_request_id || order.gateway_provider || order.status !== 'pending') return false;
      order.gateway_provider = provider;
      order.gateway_request_id = orderId;
      order.payment_request_status = 'processing';
      order.payment_request_started_at = NOW;
      return true;
    }),
    storePaymentUrl: jest.fn(async ({ redirectUrl }) => {
      order.payment_url = redirectUrl;
      order.payment_request_status = 'ready';
      return true;
    }),
    markPaymentRequestIndeterminate: jest.fn(async ({ errorCode }) => {
      order.payment_request_status = 'indeterminate';
      order.payment_error_code = errorCode;
      return true;
    }),
  };
  const gateway = {
    createPayment: jest.fn(async () => ({
      redirectUrl: 'https://test-payment.momo.vn/v2/gateway/pay?token=test',
      gatewayRequestId: ORDER_ID,
    })),
    verifyWebhook: jest.fn(),
    readResult: jest.fn(),
  };
  const gatewayFactory = jest.fn(() => gateway);
  const service = createPaymentService({
    orders,
    gatewayFactory,
    env: { PAYMENT_PROVIDER: 'momo' },
    now: () => NOW,
  });
  return { order, orders, gateway, gatewayFactory, service };
};

describe('T-41 payment request service', () => {
  test('claims the stored server-side total and stable order code before calling the gateway', async () => {
    const { orders, gateway, service } = createFixture();

    await expect(service.createPayment({ orderId: ORDER_ID, userId: 7 })).resolves.toEqual({
      status: 'ready',
      orderId: ORDER_ID,
      amountMinor: 275000,
      currency: 'VND',
      gatewayRequestId: ORDER_ID,
      redirectUrl: 'https://test-payment.momo.vn/v2/gateway/pay?token=test',
    });
    expect(gateway.createPayment).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      amountMinor: 275000,
      currency: 'VND',
      orderInfo: `Ticket order ${ORDER_ID}`,
    });
    expect(orders.claimPaymentRequest).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      userId: 7,
      amountMinor: 275000,
      currency: 'VND',
      provider: 'momo',
    });
    expect(orders.claimPaymentRequest.mock.invocationCallOrder[0])
      .toBeLessThan(gateway.createPayment.mock.invocationCallOrder[0]);
  });

  test('repeated pay clicks recover the stored URL without another gateway call', async () => {
    const { gateway, service } = createFixture();

    const first = await service.createPayment({ orderId: ORDER_ID, userId: 7 });
    await expect(service.createPayment({ orderId: ORDER_ID, userId: 7 })).resolves.toEqual(first);

    expect(gateway.createPayment).toHaveBeenCalledTimes(1);
  });

  test('status lookup after a reload recovers the persisted URL without calling the gateway', async () => {
    const { gateway, service } = createFixture();
    const created = await service.createPayment({ orderId: ORDER_ID, userId: 7 });

    await expect(service.getPaymentStatus({ orderId: ORDER_ID, userId: 7 })).resolves.toEqual(created);
    expect(gateway.createPayment).toHaveBeenCalledTimes(1);
  });

  test('Promise.all callers that read the same unclaimed order permit only one gateway request', async () => {
    const { orders, gateway, service } = createFixture();
    let release;
    gateway.createPayment.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));

    const pending = Promise.all([
      service.createPayment({ orderId: ORDER_ID, userId: 7 }),
      service.createPayment({ orderId: ORDER_ID, userId: 7 }),
    ]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(gateway.createPayment).toHaveBeenCalledTimes(1);
    expect(orders.claimPaymentRequest).toHaveBeenCalledTimes(2);
    release({
      redirectUrl: 'https://test-payment.momo.vn/v2/gateway/pay?token=test',
      gatewayRequestId: ORDER_ID,
    });

    const results = await pending;
    expect(results.map((result) => result.status).sort()).toEqual(['processing', 'ready']);
    expect(results.find((result) => result.status === 'processing').redirectUrl).toBeUndefined();
  });

  test('timeout marks the claim indeterminate and later requests require reconciliation without calling MoMo again', async () => {
    const { orders, gateway, service } = createFixture();
    gateway.createPayment.mockRejectedValueOnce(new Error('timeout'));

    await expect(service.createPayment({ orderId: ORDER_ID, userId: 7 }))
      .rejects.toMatchObject({ code: 'PAYMENT_GATEWAY_UNAVAILABLE' });
    await expect(service.createPayment({ orderId: ORDER_ID, userId: 7 }))
      .rejects.toMatchObject({
        code: 'PAYMENT_RECONCILIATION_REQUIRED',
        details: { orderId: ORDER_ID, gatewayRequestId: ORDER_ID, status: 'indeterminate' },
      });
    expect(orders.claimPaymentRequest).toHaveBeenCalledTimes(1);
    expect(gateway.createPayment).toHaveBeenCalledTimes(1);
    expect(orders.markPaymentRequestIndeterminate).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
    }));
  });

  test('a stale processing claim becomes indeterminate and is not retried', async () => {
    const { order, orders, gateway, service } = createFixture({
      gateway_provider: 'momo',
      gateway_request_id: ORDER_ID,
      payment_request_status: 'processing',
      payment_request_started_at: new Date('2026-10-14T09:00:00.000Z'),
    });

    await expect(service.getPaymentStatus({ orderId: ORDER_ID, userId: 7 }))
      .rejects.toMatchObject({ code: 'PAYMENT_RECONCILIATION_REQUIRED' });
    expect(order.payment_request_status).toBe('indeterminate');
    expect(orders.markPaymentRequestIndeterminate).toHaveBeenCalledTimes(1);
    expect(gateway.createPayment).not.toHaveBeenCalled();
  });

  test('an expired order with an existing claim is rejected without clearing the claim or contacting MoMo', async () => {
    const { order, orders, gateway, service } = createFixture({
      gateway_provider: 'momo',
      gateway_request_id: ORDER_ID,
      payment_request_status: 'processing',
      payment_request_started_at: NOW,
      expires_at: new Date('2026-10-14T09:00:00.000Z'),
    });

    await expect(service.createPayment({ orderId: ORDER_ID, userId: 7 }))
      .rejects.toMatchObject({ code: 'ORDER_EXPIRED' });
    expect(order.gateway_request_id).toBe(ORDER_ID);
    expect(orders.claimPaymentRequest).not.toHaveBeenCalled();
    expect(gateway.createPayment).not.toHaveBeenCalled();
  });

  test('an order that expires while losing the atomic claim returns ORDER_EXPIRED', async () => {
    const { order, orders, gateway, service } = createFixture();
    orders.claimPaymentRequest.mockImplementationOnce(async () => {
      order.gateway_provider = 'momo';
      order.gateway_request_id = ORDER_ID;
      order.expires_at = new Date('2026-10-14T09:00:00.000Z');
      return false;
    });

    await expect(service.createPayment({ orderId: ORDER_ID, userId: 7 }))
      .rejects.toMatchObject({ code: 'ORDER_EXPIRED' });
    expect(gateway.createPayment).not.toHaveBeenCalled();
  });

  test('an order that expires while the gateway responds is rejected and its URL is not persisted', async () => {
    const { order, orders, gateway, service } = createFixture();
    gateway.createPayment.mockImplementationOnce(async () => {
      order.expires_at = new Date('2026-10-14T09:59:00.000Z');
      return {
        redirectUrl: 'https://test-payment.momo.vn/v2/gateway/pay?token=test',
        gatewayRequestId: ORDER_ID,
      };
    });

    await expect(service.createPayment({ orderId: ORDER_ID, userId: 7 }))
      .rejects.toMatchObject({ code: 'ORDER_EXPIRED' });
    expect(orders.storePaymentUrl).not.toHaveBeenCalled();
  });

  test('an unclaimed order status is explicit and does not contact the gateway', async () => {
    const { gateway, service } = createFixture();

    await expect(service.getPaymentStatus({ orderId: ORDER_ID, userId: 7 }))
      .resolves.toEqual({ status: 'not_started', orderId: ORDER_ID });
    expect(gateway.createPayment).not.toHaveBeenCalled();
  });

  test.each([
    ['failed', { status: 'failed', orderId: ORDER_ID }],
    ['pending', { status: 'processing', orderId: ORDER_ID, retryAfterSeconds: 3 }],
  ])('status lookup reports the verified gateway %s result without recreating payment', async (gatewayResultStatus, expected) => {
    const { gateway, service } = createFixture({
      gateway_provider: 'momo',
      gateway_request_id: ORDER_ID,
      gateway_result_status: gatewayResultStatus,
    });

    await expect(service.getPaymentStatus({ orderId: ORDER_ID, userId: 7 })).resolves.toEqual(expected);
    expect(gateway.createPayment).not.toHaveBeenCalled();
  });

  test('pay retry after a failed gateway result never returns the old URL or calls the gateway again', async () => {
    const { gateway, service } = createFixture({
      gateway_provider: 'momo',
      gateway_request_id: ORDER_ID,
      gateway_result_status: 'failed',
      payment_request_status: 'ready',
      payment_url: 'https://test-payment.momo.vn/v2/gateway/pay?token=old',
    });

    await expect(service.createPayment({ orderId: ORDER_ID, userId: 7 }))
      .resolves.toEqual({ status: 'failed', orderId: ORDER_ID });
    expect(gateway.createPayment).not.toHaveBeenCalled();
  });

  test.each([
    [{ status: 'paid' }, 'ORDER_ALREADY_PAID'],
    [{ status: 'expired' }, 'ORDER_EXPIRED'],
    [{ status: 'cancelled' }, 'ORDER_NOT_PAYABLE'],
    [{ expires_at: new Date('2026-10-14T10:00:00.000Z') }, 'ORDER_EXPIRED'],
  ])('rejects non-payable order state (%s)', async (overrides, code) => {
    const { gateway, service } = createFixture(overrides);

    await expect(service.createPayment({ orderId: ORDER_ID, userId: 7 })).rejects.toMatchObject({ code });
    expect(gateway.createPayment).not.toHaveBeenCalled();
  });

  test('only the order owner can create a payment request', async () => {
    const { gateway, service } = createFixture();

    await expect(service.createPayment({ orderId: ORDER_ID, userId: 8 }))
      .rejects.toMatchObject({ code: 'ORDER_FORBIDDEN' });
    expect(gateway.createPayment).not.toHaveBeenCalled();
  });

  test('rejects malformed order IDs before querying persistence', async () => {
    const { orders, gateway, service } = createFixture();

    await expect(service.createPayment({ orderId: 'not-a-uuid', userId: 7 }))
      .rejects.toMatchObject({ code: 'INVALID_ORDER_ID' });
    expect(orders.findById).not.toHaveBeenCalled();
    expect(gateway.createPayment).not.toHaveBeenCalled();
  });

  test('ignores any client-supplied amount because the service accepts only order ID and owner ID', async () => {
    const { gateway, service } = createFixture();

    await service.createPayment({ orderId: ORDER_ID, userId: 7, amountMinor: 1 });

    expect(gateway.createPayment.mock.calls[0][0].amountMinor).toBe(275000);
  });

  test('rejects unsupported MoMo amounts before claiming the order', async () => {
    const { orders, gateway, service } = createFixture({ total_amount: 999 });

    await expect(service.createPayment({ orderId: ORDER_ID, userId: 7 }))
      .rejects.toMatchObject({ code: 'PAYMENT_AMOUNT_UNSUPPORTED' });
    expect(orders.claimPaymentRequest).not.toHaveBeenCalled();
    expect(gateway.createPayment).not.toHaveBeenCalled();
  });

  test('refuses to reuse an order payment code with a different configured provider', async () => {
    const { gateway, service } = createFixture({
      gateway_provider: 'another-provider',
      gateway_request_id: ORDER_ID,
    });

    await expect(service.createPayment({ orderId: ORDER_ID, userId: 7 }))
      .rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_MISMATCH' });
    expect(gateway.createPayment).not.toHaveBeenCalled();
  });

  test('rejects a provider response with a changed request ID and retains its claim', async () => {
    const { orders } = createFixture();
    const invalidGateway = {
      createPayment: jest.fn(async () => ({
        redirectUrl: 'https://attacker.example/pay',
        gatewayRequestId: 'different-order',
      })),
    };
    const invalidService = createPaymentService({
      orders,
      gatewayFactory: () => invalidGateway,
      env: { PAYMENT_PROVIDER: 'momo' },
      now: () => NOW,
    });

    await expect(invalidService.createPayment({ orderId: ORDER_ID, userId: 7 }))
      .rejects.toMatchObject({ code: 'PAYMENT_GATEWAY_RESPONSE_INVALID' });
    expect(orders.claimPaymentRequest).toHaveBeenCalledTimes(1);
  });
});
