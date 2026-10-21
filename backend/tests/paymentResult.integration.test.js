/**
 * Uses real T-36/T-41/T-42 tables in a unique schema of a disposable test DB.
 * Set RUN_PAYMENT_RESULT_DB_TESTS=1 and DB_NAME_TEST explicitly to opt in.
 */
const crypto = require('crypto');
const knex = require('knex');
const knexfile = require('../knexfile').test;
const migrations = [
  require('../src/migrations/006_create_seat_holds'),
  require('../src/migrations/007_create_seat_categories_and_seats'),
  require('../src/migrations/009_create_orders_and_order_items'),
  require('../src/migrations/010_add_payment_request_recovery'),
  require('../src/migrations/011_add_payment_result_state'),
  require('../src/migrations/202610210101_create_tickets'),
];
const { createPaymentResultRepository } = require('../src/repositories/paymentResultRepository');
const { createPaymentResultService } = require('../src/services/paymentResultService');

if (process.env.RUN_PAYMENT_RESULT_DB_TESTS === '1' && !process.env.DB_NAME_TEST) {
  throw new Error('Set DB_NAME_TEST to an explicitly disposable PostgreSQL database before enabling T-42 DB tests.');
}

const schema = `payment_result_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const database = knex({
  ...knexfile,
  connection: { ...knexfile.connection, database: process.env.DB_NAME_TEST || 'eventticketing_test' },
  searchPath: [schema],
  pool: { min: 0, max: 8 },
});
const describeDatabase = process.env.RUN_PAYMENT_RESULT_DB_TESTS === '1' ? describe : describe.skip;

let seatCategoryId;
let seatNumber = 0;
let orderId;
let holdId;
let seatId;
let repository;
let service;

const gateway = {
  async verifyWebhook({ rawBody }) {
    return { payload: JSON.parse(rawBody.toString('utf8')) };
  },
  async readResult(verifiedWebhook) {
    return verifiedWebhook.payload;
  },
};

const makeResult = (overrides = {}) => ({
  providerEventId: crypto.randomUUID(),
  orderId,
  gatewayRequestId: orderId,
  gatewayTransactionId: crypto.randomUUID(),
  amountMinor: 275000,
  currency: 'VND',
  status: 'succeeded',
  occurredAt: '2026-10-14T10:00:00.000Z',
  ...overrides,
});

const verify = (result) => service.verifyWebhook({
  rawBody: Buffer.from(JSON.stringify(result)),
  headers: {},
});

describeDatabase('T-42 PostgreSQL payment result transaction', () => {
  beforeAll(async () => {
    await database.schema.createSchema(schema);
    await database.schema.createTable('users', (table) => table.integer('id').primary());
    await database.schema.createTable('showtimes', (table) => table.integer('id').primary());
    await database('users').insert({ id: 7 });
    await database('showtimes').insert({ id: 9 });

    for (const migration of migrations) await migration.up(database);

    const [category] = await database('seat_categories').insert({
      showtime_id: 9,
      name: 'Standard',
    }).returning('id');
    seatCategoryId = category.id;
    repository = createPaymentResultRepository(database);
    service = createPaymentResultService({ repository, gatewayFactory: () => gateway, env: { PAYMENT_PROVIDER: 'momo' } });
  });

  afterAll(async () => {
    await database.schema.dropSchemaIfExists(schema, true);
    await database.destroy();
  });

  beforeEach(async () => {
    orderId = crypto.randomUUID();
    holdId = crypto.randomUUID();
    seatNumber += 1;
    const [seat] = await database('seats').insert({
      showtime_id: 9,
      category_id: seatCategoryId,
      row_label: 'A',
      seat_number: seatNumber,
    }).returning('id');
    seatId = seat.id;

    await database('orders').insert({
      id: orderId,
      user_id: 7,
      status: 'pending',
      total_amount: 275000,
      currency: 'VND',
      expires_at: '2099-01-01T00:00:00.000Z',
      gateway_provider: 'momo',
      gateway_request_id: orderId,
      payment_url: 'https://test-payment.momo.vn/v2/gateway/pay?token=test',
      payment_request_status: 'ready',
      payment_request_started_at: database.fn.now(),
      payment_error_code: null,
      updated_at: database.fn.now(),
    });
    await database('order_items').insert({
      order_id: orderId,
      seat_id: seatId,
      category_name: 'Standard',
      unit_price: 275000,
    });
    await database('seat_holds').insert({
      id: holdId,
      showtime_id: 9,
      user_id: 7,
      quantity: 1,
      status: 'pending_payment',
      order_id: orderId,
      expires_at: '2099-01-01T00:00:00.000Z',
    });
  });

  test('commits Paid, gateway transaction ID, and hold deletion together', async () => {
    const result = makeResult();
    const verified = await verify(result);

    await expect(database.transaction((trx) => service.applyVerifiedResult(verified, { transaction: trx })))
      .resolves.toMatchObject({ status: 'paid', orderId, gatewayTransactionId: result.gatewayTransactionId });

    await expect(database('orders').where({ id: orderId }).first())
      .resolves.toMatchObject({
        status: 'paid',
        gateway_transaction_id: result.gatewayTransactionId,
        gateway_result_status: 'succeeded',
      });
    await expect(database('order_items').where({ order_id: orderId, seat_id: seatId }).first())
      .resolves.toMatchObject({ released_at: null });
    await expect(database('seat_holds').where({ id: holdId })).resolves.toHaveLength(0);
  });

  test('rolls back the Paid update if releasing the hold fails', async () => {
    const verified = await verify(makeResult());
    const failingRepository = {
      ...repository,
      async deletePaymentHold() {
        throw new Error('simulated hold release failure');
      },
    };
    const failingService = createPaymentResultService({
      repository: failingRepository,
      gatewayFactory: () => gateway,
      env: { PAYMENT_PROVIDER: 'momo' },
    });

    await expect(database.transaction((trx) => failingService.applyVerifiedResult(verified, { transaction: trx })))
      .rejects.toThrow('simulated hold release failure');

    await expect(database('orders').where({ id: orderId }).first())
      .resolves.toMatchObject({ status: 'pending', gateway_transaction_id: null, gateway_result_status: null });
    await expect(database('seat_holds').where({ id: holdId })).resolves.toHaveLength(1);
  });

  test('concurrent duplicate results serialize on the order and only one commits Paid', async () => {
    const result = makeResult();
    const [first, second] = await Promise.all([verify(result), verify(result)]);

    const outcomes = await Promise.all([first, second].map((verified) => database.transaction(
      (trx) => service.applyVerifiedResult(verified, { transaction: trx }),
    )));

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['duplicate', 'paid']);
    await expect(database('orders').where({ id: orderId }).first('status'))
      .resolves.toMatchObject({ status: 'paid' });
    await expect(database('seat_holds').where({ id: holdId })).resolves.toHaveLength(0);
  });

  test('a success waiting behind expiry becomes NeedsReview and cannot sell released seats', async () => {
    const verified = await verify(makeResult());
    let signalLocked;
    let releaseExpiry;
    const locked = new Promise((resolve) => { signalLocked = resolve; });
    const gate = new Promise((resolve) => { releaseExpiry = resolve; });

    const expiry = database.transaction(async (trx) => {
      await trx('orders').where({ id: orderId }).forUpdate().first();
      await trx('orders').where({ id: orderId }).update({ status: 'expired' });
      await trx('order_items').where({ order_id: orderId }).update({ released_at: trx.raw('clock_timestamp()') });
      await trx('seat_holds').where({ id: holdId }).del();
      signalLocked();
      await gate;
    });
    await locked;

    const payment = database.transaction((trx) => service.applyVerifiedResult(verified, { transaction: trx }));
    releaseExpiry();
    await expiry;
    await expect(payment).resolves.toMatchObject({ status: 'needs_review', reason: 'LATE_PAYMENT_SUCCESS' });

    await expect(database('orders').where({ id: orderId }).first())
      .resolves.toMatchObject({ status: 'needs_review', gateway_result_status: 'succeeded' });
    await expect(database('order_items').where({ order_id: orderId }).first())
      .resolves.toMatchObject({ released_at: expect.any(Date) });
    await expect(database('seat_holds').where({ order_id: orderId })).resolves.toHaveLength(0);
  });
});
