/**
 * T-53 / SCRUM-201 (S-23): chứng minh job nhả đơn quá hạn (T-52) không đụng tới đơn đã thanh toán.
 *
 * Chạy migrations thật, job thật (orderExpiryService + OrderExpiry repository), và làm đơn
 * thành "đã thanh toán" bằng đường thật: IPN MoMo ký bằng khoá thử -> route webhook T-46 -> T-42.
 * So sánh ảnh chụp (snapshot) đơn đã thanh toán trước và sau khi job chạy: phải giống hệt.
 */
process.env.JWT_SECRET = 't53-auth-test-only';
process.env.PAYMENT_PROVIDER = 'momo';
process.env.MOMO_PARTNER_CODE = 'T53TEST';
process.env.MOMO_ACCESS_KEY = 't53-access-key';
process.env.MOMO_SECRET_KEY = 't53-secret-key-test-only';
process.env.MOMO_REDIRECT_URL = 'http://localhost:8080/payment/return';
process.env.MOMO_IPN_URL = 'http://localhost:3000/api/payments/webhook';

const crypto = require('crypto');
const path = require('path');
const knex = require('knex');
const request = require('supertest');
const config = require('../knexfile').test;
const { createWebhookSignatureData, sign } = require('../src/payments/adapters/MoMoGateway');

const schema = `t53_test_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const mockDatabase = knex({
  ...config,
  connection: { ...config.connection, database: process.env.DB_NAME_TEST || config.connection.database },
  searchPath: [schema],
  pool: { min: 0, max: 8 },
});
jest.mock('../src/config/database', () => mockDatabase);
const app = require('../src/app');
const { createOrderExpiryRepository } = require('../src/models/OrderExpiry');
const { createOrderExpiryService } = require('../src/services/orderExpiryService');
const { createPaymentResultRepository } = require('../src/repositories/paymentResultRepository');
const { createPaymentResultService } = require('../src/services/paymentResultService');
const database = mockDatabase;
const describeDatabase = process.env.RUN_ORDER_EXPIRY_DB_TESTS === '1' ? describe : describe.skip;

const PAID = '50000000-0000-4000-8000-00000000000a'; // ghế 1-3, đã thanh toán qua webhook
const OVERDUE = '50000000-0000-4000-8000-00000000000b'; // ghế 4-5, chờ trả, đã quá hạn
const FUTURE = '50000000-0000-4000-8000-00000000000c'; // ghế 6, chờ trả, còn hạn
const CANCELLED = '50000000-0000-4000-8000-00000000000d'; // ghế 7, đã huỷ, quá hạn
const REVIEW = '50000000-0000-4000-8000-00000000000e'; // ghế 8, cần đối soát, quá hạn
const SEATS = { [PAID]: [1, 2, 3], [OVERDUE]: [4, 5], [FUTURE]: [6], [CANCELLED]: [7], [REVIEW]: [8] };
const PRICE = 100000;

const job = () => createOrderExpiryService(createOrderExpiryRepository(database)).cleanupExpired();
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** IPN thành công của MoMo cho một đơn, đã ký bằng khoá thử. */
const momoIpn = (orderId, transId) => {
  const payload = {
    partnerCode: process.env.MOMO_PARTNER_CODE, orderId, requestId: orderId, amount: SEATS[orderId].length * PRICE,
    orderInfo: 'Thanh toan ve', orderType: 'momo_wallet', transId, resultCode: 0,
    message: 'Successful.', payType: 'qr', responseTime: 1792000000000, extraData: '',
  };
  payload.signature = sign(process.env.MOMO_SECRET_KEY, createWebhookSignatureData(payload, process.env.MOMO_ACCESS_KEY));
  return JSON.stringify(payload);
};

const insertOrder = async (id, { status = 'pending', expiresAt = '2099-01-01', released = false } = {}) => {
  const userId = 1;
  await database('orders').insert({
    id, user_id: userId, status, total_amount: SEATS[id].length * PRICE, currency: 'VND', expires_at: expiresAt,
    gateway_provider: 'momo', gateway_request_id: id, payment_request_status: 'ready',
    payment_url: 'https://test-payment.momo.vn/v2/gateway/pay?t=t53', payment_request_started_at: database.fn.now(),
  });
  await database('order_items').insert(SEATS[id].map((seatId) => ({
    order_id: id, seat_id: seatId, category_name: 'Standard', unit_price: PRICE,
    released_at: released ? database.raw('clock_timestamp()') : null,
  })));
  if (status === 'pending') {
    await database('seat_holds').insert({
      id: crypto.randomUUID(), order_id: id, user_id: userId, showtime_id: 1, quantity: SEATS[id].length,
      status: 'pending_payment', expires_at: expiresAt,
    });
  }
};

// Ảnh chụp mọi thứ thuộc về một đơn: dòng đơn, các ghế (vé), lượt giữ, biên nhận thanh toán
const snapshot = async (orderId) => ({
  order: await database('orders').where({ id: orderId }).first(),
  items: await database('order_items').where({ order_id: orderId }).orderBy('seat_id'),
  holds: await database('seat_holds').where({ order_id: orderId }).orderBy('id'),
  receipts: await database('payment_events').where({ order_id: orderId }).orderBy('id'),
});
const liveSeats = (orderId) => database('order_items').where({ order_id: orderId }).whereNull('released_at').orderBy('seat_id').pluck('seat_id');

/** Đơn PAID được thanh toán qua webhook thật, rồi hạn thanh toán trôi qua (đã trả trước hạn). */
const payThenPassDeadline = async () => {
  const res = await request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').send(momoIpn(PAID, 5300000001));
  expect(res.status).toBe(200);
  await database('orders').where({ id: PAID }).update({ expires_at: database.raw("clock_timestamp() - interval '1 hour'") });
  const paid = await snapshot(PAID);
  expect(paid.order).toMatchObject({ status: 'paid', gateway_transaction_id: '5300000001' });
  expect(paid.holds).toHaveLength(0);
  return paid;
};

describeDatabase('T-53: job nhả đơn quá hạn không đụng tới đơn đã thanh toán', () => {
  beforeAll(async () => {
    await database.schema.createSchema(schema);
    await database.migrate.latest({ directory: path.join(__dirname, '../src/migrations') });
    await database('roles').insert({ id: 1, name: 'buyer' });
    await database('users').insert({ id: 1, email: 't53@example.test', password_hash: 'fixture', role_id: 1 });
    await database('events').insert({ id: 1, organizer_id: 1, title: 'T-53 test', venue: 'Test', status: 'published' });
    await database('showtimes').insert({ id: 1, event_id: 1, starts_at: '2099-01-01', capacity: 8, price: PRICE, status: 'on_sale' });
    await database('seat_categories').insert({ id: 1, showtime_id: 1, name: 'Standard' });
    await database('seats').insert([1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id, showtime_id: 1, category_id: 1, row_label: 'A', seat_number: id })));
  }, 30000);

  beforeEach(async () => {
    for (const table of ['payment_events', 'seat_holds', 'order_items', 'orders']) await database(table).del();
  });

  afterAll(async () => {
    await require('../src/services/showtimePageCache').close();
    await database.schema.dropSchemaIfExists(schema, true);
    await database.destroy();
  });

  test('5 loại đơn: chỉ đơn chờ trả đã quá hạn bị nhả; đơn đã thanh toán giữ nguyên từng trường', async () => {
    await insertOrder(PAID);
    await insertOrder(OVERDUE, { expiresAt: database.raw("clock_timestamp() - interval '1 minute'") });
    await insertOrder(FUTURE);
    await insertOrder(CANCELLED, { status: 'cancelled', expiresAt: '2000-01-01', released: true });
    await insertOrder(REVIEW, { status: 'needs_review', expiresAt: '2000-01-01' });
    const paidBefore = await payThenPassDeadline();
    const othersBefore = { future: await snapshot(FUTURE), cancelled: await snapshot(CANCELLED), review: await snapshot(REVIEW) };

    expect(await job()).toBe(1);

    expect(await snapshot(PAID)).toEqual(paidBefore); // đơn đã thanh toán: không đổi một trường nào
    expect(await liveSeats(PAID)).toEqual([1, 2, 3]); // 3 vé vẫn còn
    expect(await database('orders').where({ id: OVERDUE }).first()).toMatchObject({ status: 'expired' });
    expect(await liveSeats(OVERDUE)).toEqual([]); // ghế 4, 5 được nhả
    expect(await database('seat_holds').where({ order_id: OVERDUE })).toHaveLength(0);
    expect(await snapshot(FUTURE)).toEqual(othersBefore.future);
    expect(await snapshot(CANCELLED)).toEqual(othersBefore.cancelled);
    expect(await snapshot(REVIEW)).toEqual(othersBefore.review);
  });

  test('Job chạy lại 5 lần liên tiếp và 5 worker song song: đơn đã thanh toán vẫn giữ nguyên, không nhả gì thêm', async () => {
    await insertOrder(PAID);
    await insertOrder(OVERDUE, { expiresAt: database.raw("clock_timestamp() - interval '1 minute'") });
    const paidBefore = await payThenPassDeadline();

    const sequential = [];
    for (let i = 0; i < 5; i += 1) sequential.push(await job());
    const parallel = await Promise.all(Array.from({ length: 5 }, () => job()));

    expect(sequential).toEqual([1, 0, 0, 0, 0]); // chỉ lần đầu nhả đơn quá hạn
    expect(parallel).toEqual([0, 0, 0, 0, 0]);
    expect(await snapshot(PAID)).toEqual(paidBefore);
    expect(await liveSeats(PAID)).toEqual([1, 2, 3]);
  });

  test('Thanh toán thắng trước hạn khi job đang chờ khoá: job bỏ qua, đơn vẫn paid và giữ 3 vé', async () => {
    await insertOrder(PAID, { expiresAt: database.raw("clock_timestamp() + interval '1 second'") });
    const payments = createPaymentResultService({ repository: createPaymentResultRepository(database) });
    const verified = await payments.verifyWebhook({ rawBody: Buffer.from(momoIpn(PAID, 5300000002)), headers: {} });

    // Thanh toán đã ghi trong transaction nhưng CHƯA commit (đang giữ khoá đơn), trước hạn.
    const paymentTrx = await database.transaction();
    let cleanup;
    try {
      expect(await payments.applyVerifiedResult(verified, { transaction: paymentTrx })).toMatchObject({ status: 'paid' });
      await wait(1500); // hạn thanh toán trôi qua trong lúc giao dịch chưa commit

      // Job thấy đơn "pending" đã quá hạn (bản đã commit) và phải chờ khoá của thanh toán.
      let settled = false;
      cleanup = job().finally(() => { settled = true; });
      await wait(300);
      expect(settled).toBe(false);
      await paymentTrx.commit();
    } catch (error) {
      await paymentTrx.rollback();
      throw error;
    }

    expect(await cleanup).toBe(0); // sau khi lấy khoá, job đọc lại thấy paid và bỏ qua
    expect(await database('orders').where({ id: PAID }).first()).toMatchObject({ status: 'paid', gateway_transaction_id: '5300000002' });
    expect(await liveSeats(PAID)).toEqual([1, 2, 3]);
  });
});
