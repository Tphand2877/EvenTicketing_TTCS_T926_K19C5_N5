/** Run with RUN_PAYMENT_CLAIM_DB_TESTS=1 against a disposable PostgreSQL DB. */
const crypto = require('crypto');
const knex = require('knex');
const config = require('../knexfile').test;
const paymentRecoveryMigration = require('../src/migrations/010_add_payment_request_recovery');

const schema = `payment_claim_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const mockDatabase = knex({ ...config, searchPath: [schema], pool: { min: 0, max: 8 } });
jest.mock('../src/config/database', () => mockDatabase);

const Order = require('../src/models/Order');
const describeDatabase = process.env.RUN_PAYMENT_CLAIM_DB_TESTS === '1' ? describe : describe.skip;
const orderId = '33333333-3333-4333-8333-333333333333';
const legacyClaimId = '44444444-4444-4444-8444-444444444444';
const expiredOrderId = '55555555-5555-4555-8555-555555555555';

describeDatabase('T-41 PostgreSQL atomic payment claim', () => {
  beforeAll(async () => {
    await mockDatabase.schema.createSchema(schema);
    await mockDatabase.schema.createTable('orders', (table) => {
      table.uuid('id').primary();
      table.integer('user_id').notNullable();
      table.string('status').notNullable();
      table.integer('total_amount').notNullable();
      table.string('currency').notNullable();
      table.timestamp('expires_at', { useTz: true }).notNullable();
      table.string('gateway_provider').nullable();
      table.string('gateway_request_id').nullable();
      table.timestamp('updated_at', { useTz: true }).notNullable();
    });
    const baseOrder = {
      user_id: 7,
      status: 'pending',
      total_amount: 275000,
      currency: 'VND',
      expires_at: '2099-01-01T00:00:00Z',
      updated_at: mockDatabase.fn.now(),
    };
    await mockDatabase('orders').insert([
      { ...baseOrder, id: orderId },
      { ...baseOrder, id: legacyClaimId, gateway_provider: 'momo', gateway_request_id: legacyClaimId },
      { ...baseOrder, id: expiredOrderId, expires_at: '2000-01-01T00:00:00Z' },
    ]);
    await paymentRecoveryMigration.up(mockDatabase);
  });

  afterAll(async () => {
    await mockDatabase.schema.dropSchemaIfExists(schema, true);
    await mockDatabase.destroy();
  });

  test('12 concurrent claim attempts commit exactly one winner', async () => {
    const input = { orderId, userId: 7, amountMinor: 275000, currency: 'VND', provider: 'momo' };
    const results = await Promise.all(Array.from({ length: 12 }, () => Order.claimPaymentRequest(input)));

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await mockDatabase('orders').where({ id: orderId }).first('gateway_provider', 'gateway_request_id'))
      .toMatchObject({ gateway_provider: 'momo', gateway_request_id: orderId });
  });

  test('backfills pre-migration claims as indeterminate for manual reconciliation', async () => {
    await expect(mockDatabase('orders').where({ id: legacyClaimId }).first())
      .resolves.toMatchObject({
        payment_request_status: 'indeterminate',
        gateway_request_id: legacyClaimId,
      });
  });

  test('expired order cannot be atomically claimed', async () => {
    const claimed = await Order.claimPaymentRequest({
      orderId: expiredOrderId,
      userId: 7,
      amountMinor: 275000,
      currency: 'VND',
      provider: 'momo',
    });

    expect(claimed).toBe(false);
  });

  test('persists one redirect URL on the winning claim for recovery', async () => {
    const saved = await Order.storePaymentUrl({
      orderId,
      userId: 7,
      provider: 'momo',
      gatewayRequestId: orderId,
      redirectUrl: 'https://test-payment.momo.vn/v2/gateway/pay?token=recovery',
    });

    expect(saved).toBe(true);
    await expect(mockDatabase('orders').where({ id: orderId }).first())
      .resolves.toMatchObject({
        payment_request_status: 'ready',
        payment_url: 'https://test-payment.momo.vn/v2/gateway/pay?token=recovery',
      });
  });
});
