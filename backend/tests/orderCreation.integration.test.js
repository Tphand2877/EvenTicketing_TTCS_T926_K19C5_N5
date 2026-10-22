/**
 * S-16 / T-37, T-38: tạo đơn từ lượt giữ ghế, chạy app thật trên PostgreSQL thật.
 * Giữ chỗ qua API giữ chỗ thật, tạo đơn qua POST /api/payments/orders, rồi thanh toán
 * đơn vừa tạo bằng IPN MoMo ký bằng khoá thử để chứng minh đơn hợp lệ với T-42.
 */
process.env.JWT_SECRET = 's16-auth-test-only';
process.env.PAYMENT_PROVIDER = 'momo';
process.env.MOMO_PARTNER_CODE = 'S16TEST';
process.env.MOMO_ACCESS_KEY = 's16-access-key';
process.env.MOMO_SECRET_KEY = 's16-secret-key-test-only';
process.env.MOMO_REDIRECT_URL = 'http://localhost:8080/payment/return';
process.env.MOMO_IPN_URL = 'http://localhost:3000/api/payments/webhook';

const crypto = require('crypto');
const path = require('path');
const knex = require('knex');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../knexfile').test;
const { createWebhookSignatureData, sign } = require('../src/payments/adapters/MoMoGateway');

const schema = `s16_test_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const mockDatabase = knex({
  ...config,
  connection: { ...config.connection, database: process.env.DB_NAME_TEST || config.connection.database },
  searchPath: [schema],
  pool: { min: 0, max: 8 },
});
jest.mock('../src/config/database', () => mockDatabase);
const app = require('../src/app');
const database = mockDatabase;
const describeDatabase = process.env.RUN_ORDER_CREATION_DB_TESTS === '1' ? describe : describe.skip;

const auth = (userId) => `Bearer ${jwt.sign({ userId, role: 'buyer' }, process.env.JWT_SECRET)}`;
const hold = async (userId, showtimeId, quantity) => {
  const res = await request(app).post(`/api/showtimes/${showtimeId}/holds`).set('Authorization', auth(userId)).send({ quantity });
  expect(res.status).toBe(201);
  return res.body.data.hold.id;
};
const createOrder = (userId, holdId, extra = {}) => request(app).post('/api/payments/orders')
  .set('Authorization', auth(userId)).send({ holdId, ...extra });
const itemsOf = (orderId) => database('order_items').join('seats', 'seats.id', 'order_items.seat_id')
  .where({ order_id: orderId }).orderBy('seats.id').select('seats.id as seat', 'seats.showtime_id as showtime', 'order_items.unit_price as price');
const orderIdOf = (res) => res.body.data.order.id ?? res.body.data.order.order?.id;

describeDatabase('S-16: tạo đơn từ ghế đang giữ', () => {
  beforeAll(async () => {
    await database.schema.createSchema(schema);
    await database.migrate.latest({ directory: path.join(__dirname, '../src/migrations') });
    await database('roles').insert({ id: 1, name: 'buyer' });
    await database('users').insert([1, 2, 3].map((id) => ({ id, email: `s16-${id}@example.test`, password_hash: 'fixture', role_id: 1 })));
    await database('events').insert({ id: 1, organizer_id: 1, title: 'S-16 test', venue: 'Test', status: 'published' });
  }, 30000);

  // Suất 1: 3 ghế giá 100.000đ; suất 2: 3 ghế giá 900.000đ
  beforeEach(async () => {
    for (const table of ['payment_events', 'order_items', 'seat_holds', 'orders', 'seats', 'seat_categories', 'showtimes']) await database(table).del();
    await database('showtimes').insert([
      { id: 1, event_id: 1, starts_at: '2099-01-01', capacity: 3, price: 100000, status: 'on_sale' },
      { id: 2, event_id: 1, starts_at: '2099-02-01', capacity: 3, price: 900000, status: 'on_sale' },
    ]);
    await database('seat_categories').insert([{ id: 1, showtime_id: 1, name: 'Thường' }, { id: 2, showtime_id: 2, name: 'VIP' }]);
    await database('seats').insert([1, 2, 3].map((id) => ({ id, showtime_id: 1, category_id: 1, row_label: 'A', seat_number: id }))
      .concat([4, 5, 6].map((id) => ({ id, showtime_id: 2, category_id: 2, row_label: 'B', seat_number: id - 3 }))));
  });

  afterAll(async () => {
    await require('../src/services/showtimePageCache').close();
    await database.schema.dropSchemaIfExists(schema, true);
    await database.destroy();
  });

  test('AC1, AC2: giữ 2 chỗ ở suất 2 -> đơn chỉ gồm ghế của suất 2, tổng tiền do server tính', async () => {
    const res = await createOrder(2, await hold(2, 2, 2), { total: 1, total_amount: 1 });

    expect(res.status).toBe(201);
    const orderId = orderIdOf(res);
    expect(await itemsOf(orderId)).toEqual([{ seat: 4, showtime: 2, price: 900000 }, { seat: 5, showtime: 2, price: 900000 }]);
    expect(await database('orders').where({ id: orderId }).first()).toMatchObject({ status: 'pending', total_amount: 1800000 });
    expect(await database('seat_holds').where({ order_id: orderId }).first()).toMatchObject({ status: 'pending_payment', quantity: 2 });
  });

  test('Nhiều người mua ở hai suất: mỗi đơn nhận ghế riêng của suất mình, không trùng, không lỗi 500', async () => {
    const a = await createOrder(1, await hold(1, 2, 2));
    const b = await createOrder(2, await hold(2, 1, 2));
    const c = await createOrder(3, await hold(3, 2, 1));

    expect([a.status, b.status, c.status]).toEqual([201, 201, 201]);
    expect((await itemsOf(orderIdOf(a))).map((i) => i.seat)).toEqual([4, 5]);
    expect((await itemsOf(orderIdOf(b))).map((i) => i.seat)).toEqual([1, 2]);
    expect((await itemsOf(orderIdOf(c))).map((i) => i.seat)).toEqual([6]);
  });

  test('Hai người tạo đơn cùng lúc trên một suất: ghế không bị cấp trùng', async () => {
    const holds = [await hold(1, 1, 1), await hold(2, 1, 2)];
    const responses = await Promise.all([createOrder(1, holds[0]), createOrder(2, holds[1])]);

    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    const seats = (await database('order_items').whereNull('released_at').orderBy('seat_id').pluck('seat_id'));
    expect(seats).toEqual([1, 2, 3]);
  });

  test('Ghế của suất đã bị đơn khác chiếm hết -> 409, không tạo đơn', async () => {
    await createOrder(1, await hold(1, 1, 3));
    // Lượt giữ thứ hai được tạo trước khi đơn đầu chiếm ghế (giữ chỗ theo số lượng không biết ghế cụ thể)
    await database('seat_holds').insert({ id: crypto.randomUUID(), user_id: 2, showtime_id: 1, quantity: 1, status: 'active', expires_at: '2099-01-01' });
    const late = await database('seat_holds').where({ user_id: 2 }).first();
    const res = await createOrder(2, late.id);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_ENOUGH_SEATS');
    expect(await database('orders').where({ user_id: 2 })).toHaveLength(0);
  });

  test('Lỗi: tạo đơn lần 2 từ cùng hold; hold người khác; hold hết hạn; hold không tồn tại', async () => {
    const holdId = await hold(1, 1, 1);
    expect((await createOrder(1, holdId)).status).toBe(201);
    const again = await createOrder(1, holdId);
    expect([again.status, again.body.code]).toEqual([409, 'HOLD_ALREADY_ORDERED']);
    // Trang thanh toán tải lại: nhận lại mã đơn đã tạo để tiếp tục, không tạo đơn thứ hai
    const existing = (await database('seat_holds').where({ id: holdId }).first()).order_id;
    expect(again.body.details).toEqual({ orderId: existing });

    const other = await hold(2, 1, 1);
    expect((await createOrder(3, other)).status).toBe(403);
    await database('seat_holds').where({ id: other }).update({ expires_at: database.raw("clock_timestamp() - interval '1 second'") });
    expect((await createOrder(2, other)).body.code).toBe('HOLD_EXPIRED');
    expect((await createOrder(2, crypto.randomUUID())).status).toBe(404);
    expect(await database('orders')).toHaveLength(1);
  });

  test('Giá theo hạng (S-15): hạng có giá dùng giá hạng; hạng chưa đặt giá dùng giá gốc của suất', async () => {
    try {
      const unpriced = await createOrder(1, await hold(1, 1, 1));
      expect(unpriced.status).toBe(201);
      expect((await itemsOf(orderIdOf(unpriced))).map((i) => i.price)).toEqual([100000]);

      await database('seat_categories').where({ id: 1 }).update({ price: 250000 });
      const priced = await createOrder(2, await hold(2, 1, 2));
      expect(priced.status).toBe(201);
      expect((await itemsOf(orderIdOf(priced))).map((i) => i.price)).toEqual([250000, 250000]);
    } finally {
      await database('seat_categories').update({ price: null });
    }
  });

  test('Đơn vừa tạo thanh toán được: IPN MoMo thành công -> paid, giữ đúng ghế', async () => {
    const res = await createOrder(2, await hold(2, 2, 2));
    const orderId = orderIdOf(res);
    // Bước T-41 (gọi MoMo tạo link) ghi nhà cung cấp và mã yêu cầu; giả lập vì test không gọi MoMo thật
    await database('orders').where({ id: orderId }).update({
      gateway_provider: 'momo', gateway_request_id: orderId, payment_request_status: 'ready',
      payment_url: 'https://test-payment.momo.vn/v2/gateway/pay?t=s16', payment_request_started_at: database.fn.now(),
    });
    const payload = {
      partnerCode: process.env.MOMO_PARTNER_CODE, orderId, requestId: orderId, amount: 1800000, orderInfo: 'Ve',
      orderType: 'momo_wallet', transId: 1600000001, resultCode: 0, message: 'Successful.', payType: 'qr', responseTime: Date.now(), extraData: '',
    };
    payload.signature = sign(process.env.MOMO_SECRET_KEY, createWebhookSignatureData(payload, process.env.MOMO_ACCESS_KEY));
    const ipn = await request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').send(JSON.stringify(payload));

    expect(ipn.status).toBe(200);
    expect(await database('orders').where({ id: orderId }).first()).toMatchObject({ status: 'paid', gateway_transaction_id: '1600000001' });
    expect((await itemsOf(orderId)).map((i) => i.seat)).toEqual([4, 5]);
  });
});
