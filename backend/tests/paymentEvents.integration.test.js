/** T-45/T-46 receipt persistence only; no payment gateway/order/ticket fixture implementation. */
const crypto = require('crypto');
const knex = require('knex');
const config = require('../knexfile').test;
const { createPaymentEventRepository } = require('../src/models/PaymentEvent');
const { createPaymentWebhookService } = require('../src/services/paymentWebhookService');
const migration = require('../src/migrations/202610140001_create_payment_events');
const schema = `t45_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const database = knex({ ...config, connection: { ...config.connection, database: process.env.DB_NAME_TEST || config.connection.database },
  searchPath: [schema], pool: { min: 0, max: 4 } });
const repository = createPaymentEventRepository(database);
const verifiedResult = { gatewayTransactionId: 'transaction-1', providerEventId: 'event-1', orderId: 'order-1' };
const rawPayload = '{  "amount" : 100000 }\n';
const describeDatabase = process.env.RUN_PAYMENT_EVENT_DB_TESTS === '1' ? describe : describe.skip;
describeDatabase('T-45/T-46 unique receipts and callback transaction', () => {
  beforeAll(async () => {
    if (!process.env.DB_NAME_TEST || !/test/i.test(process.env.DB_NAME_TEST)) throw new Error('Explicit disposable DB_NAME_TEST required.');
    await database.schema.createSchema(schema);
    await migration.up(database);
  });
  beforeEach(() => database('payment_events').del());
  afterAll(async () => { await database.schema.dropSchemaIfExists(schema, true); await database.destroy(); });
  test('T-45 rejects a direct duplicate transaction ID and preserves exact raw text/time', async () => {
    const row = { transaction_id: 'unique-tx', order_id: 'order-1', raw_payload: rawPayload };
    await database('payment_events').insert(row);
    await expect(database('payment_events').insert(row)).rejects.toMatchObject({ code: '23505' });
    expect(await database('payment_events').first()).toMatchObject({ raw_payload: rawPayload, received_at: expect.any(Date) });
  });
  test.each(['sequential', 'parallel'])('T-46 %s duplicate handling invokes its T-42 boundary only once', async (mode) => {
    const paymentResults = { applyVerifiedResult: jest.fn(async (_verified, { transaction }) => {
      await transaction.raw('SELECT 1');
      return { status: 'paid' };
    }) };
    const service = createPaymentWebhookService({ repository, paymentResults });
    const process = () => service.handle({ verifiedResult, rawPayload });
    const results = mode === 'parallel' ? await Promise.all([process(), process()]) : [await process(), await process(), await process(), await process(), await process()];
    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    expect(paymentResults.applyVerifiedResult).toHaveBeenCalledTimes(1);
    expect(await database('payment_events')).toHaveLength(1);
  });
  test('A T-42 exception rolls back its receipt; the next attempt can process', async () => {
    const paymentResults = { applyVerifiedResult: jest.fn().mockRejectedValueOnce(new Error('callback failure')).mockResolvedValue({ status: 'paid' }) };
    const service = createPaymentWebhookService({ repository, paymentResults });
    await expect(service.handle({ verifiedResult, rawPayload })).rejects.toThrow();
    expect(await database('payment_events')).toHaveLength(0);
    expect(await service.handle({ verifiedResult, rawPayload })).toMatchObject({ duplicate: false });
  });
  test('Unrelated DB errors are not treated as duplicate success', async () => {
    await expect(repository.processOnce({ transactionId: 'tx-2', orderId: null, rawPayload: '{}' }, async () => ({ outcome: 'processed' })))
      .rejects.toMatchObject({ code: '23502' });
  });
  test('Only T-45 migration rolls back/reapplies, without defining orders/payment/tickets', async () => {
    await migration.down(database);
    expect(await database.schema.hasTable('payment_events')).toBe(false);
    await migration.up(database);
    expect(await database.schema.hasTable('payment_events')).toBe(true);
    expect(await database.schema.hasTable('orders')).toBe(false);
  });
});
