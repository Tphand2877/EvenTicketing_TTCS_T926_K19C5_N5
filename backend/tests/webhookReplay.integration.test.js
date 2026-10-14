/**
 * T-47 / SCRUM-208 (S-20): gửi lại cùng một webhook 5 lần rồi đếm số vé được tạo.
 *
 * Chạy app thật (route T-46), migrations thật, adapter MoMo thật (T-40) và bộ xử lý kết quả T-42
 * trên một schema PostgreSQL riêng. IPN được ký đúng như MoMo bằng khoá thử.
 * "Vé" = ghế đã bán: order_items chưa nhả của đơn đã thanh toán.
 * Đếm vé SAU TỪNG LẦN gửi để chứng minh vé chỉ được tạo ở lần đầu.
 */
process.env.JWT_SECRET = 't47-auth-test-only';
process.env.PAYMENT_PROVIDER = 'momo';
process.env.MOMO_PARTNER_CODE = 'T47TEST';
process.env.MOMO_ACCESS_KEY = 't47-access-key';
process.env.MOMO_SECRET_KEY = 't47-secret-key-test-only';
process.env.MOMO_REDIRECT_URL = 'http://localhost:8080/payment/return';
process.env.MOMO_IPN_URL = 'http://localhost:3000/api/payments/webhook';

const crypto = require('crypto');
const path = require('path');
const knex = require('knex');
const request = require('supertest');
const config = require('../knexfile').test;
const { createWebhookSignatureData, sign } = require('../src/payments/adapters/MoMoGateway');

const schema = `t47_test_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const mockDatabase = knex({
  ...config,
  connection: { ...config.connection, database: process.env.DB_NAME_TEST || config.connection.database },
  searchPath: [schema],
  pool: { min: 0, max: 8 },
});
jest.mock('../src/config/database', () => mockDatabase);
const app = require('../src/app');
const database = mockDatabase;
const describeDatabase = process.env.RUN_PAYMENT_EVENT_DB_TESTS === '1' ? describe : describe.skip;

const ORDER_A = '20000000-0000-4000-8000-00000000000a';
const ORDER_B = '20000000-0000-4000-8000-00000000000b';
const HOLD_A = '30000000-0000-4000-8000-00000000000a';
const HOLD_B = '30000000-0000-4000-8000-00000000000b';
const TOTAL = 300000; // 3 ghế x 100.000đ
const REPLAYS = 5;

/** IPN thành công của MoMo cho một đơn, đã ký bằng khoá thử. */
const momoIpn = (orderId, transId, overrides = {}) => {
  const payload = {
    partnerCode: process.env.MOMO_PARTNER_CODE, orderId, requestId: orderId, amount: TOTAL,
    orderInfo: 'Thanh toan ve', orderType: 'momo_wallet', transId, resultCode: 0,
    message: 'Successful.', payType: 'qr', responseTime: 1792000000000, extraData: '', ...overrides,
  };
  payload.signature = sign(process.env.MOMO_SECRET_KEY, createWebhookSignatureData(payload, process.env.MOMO_ACCESS_KEY));
  return payload;
};
const send = (rawBody) => request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').send(rawBody);
const count = async (table, where = {}) => Number((await database(table).where(where).count({ n: '*' }).first()).n);
// Vé của một đơn = ghế đã bán: order_items chưa nhả của đơn ở trạng thái paid
const tickets = async (orderId) => Number((await database('order_items')
  .join('orders', 'orders.id', 'order_items.order_id')
  .where({ 'orders.id': orderId, 'orders.status': 'paid' }).whereNull('order_items.released_at')
  .count({ n: '*' }).first()).n);
const soldSeats = () => database('order_items').join('orders', 'orders.id', 'order_items.order_id')
  .where('orders.status', 'paid').whereNull('order_items.released_at').orderBy('seat_id').pluck('seat_id');

describeDatabase('T-47: gửi lại cùng một webhook 5 lần và đếm số vé', () => {
  beforeAll(async () => {
    await database.schema.createSchema(schema);
    await database.migrate.latest({ directory: path.join(__dirname, '../src/migrations') });
    await database('roles').insert({ id: 1, name: 'buyer' });
    await database('users').insert([1, 2].map((id) => ({ id, email: `t47-${id}@example.test`, password_hash: 'fixture', role_id: 1 })));
    await database('events').insert({ id: 1, organizer_id: 1, title: 'T-47 test', venue: 'Test', status: 'published' });
    await database('showtimes').insert({ id: 1, event_id: 1, starts_at: '2099-01-01', capacity: 6, price: 100000, status: 'on_sale' });
    await database('seat_categories').insert({ id: 1, showtime_id: 1, name: 'Standard' });
    await database('seats').insert([1, 2, 3, 4, 5, 6].map((id) => ({ id, showtime_id: 1, category_id: 1, row_label: 'A', seat_number: id })));
  }, 30000);

  // Mỗi test bắt đầu với 2 đơn chờ thanh toán: đơn A (ghế 1-3) và đơn B (ghế 4-6)
  beforeEach(async () => {
    for (const table of ['payment_events', 'seat_holds', 'order_items', 'orders']) await database(table).del();
    await database('orders').insert([[ORDER_A, 1], [ORDER_B, 2]].map(([id, userId]) => ({
      id, user_id: userId, status: 'pending', total_amount: TOTAL, currency: 'VND', expires_at: '2099-01-01',
      gateway_provider: 'momo', gateway_request_id: id, payment_request_status: 'ready',
      payment_url: 'https://test-payment.momo.vn/v2/gateway/pay?t=t47', payment_request_started_at: database.fn.now(),
    })));
    await database('order_items').insert([1, 2, 3, 4, 5, 6].map((seatId) => ({
      order_id: seatId <= 3 ? ORDER_A : ORDER_B, seat_id: seatId, category_name: 'Standard', unit_price: 100000,
    })));
    await database('seat_holds').insert([[HOLD_A, ORDER_A, 1], [HOLD_B, ORDER_B, 2]].map(([id, orderId, userId]) => ({
      id, order_id: orderId, user_id: userId, showtime_id: 1, quantity: 3, status: 'pending_payment', expires_at: '2099-01-01',
    })));
  });

  afterAll(async () => {
    await require('../src/services/showtimePageCache').close();
    await database.schema.dropSchemaIfExists(schema, true);
    await database.destroy();
  });

  test('Gửi lại đúng một webhook 5 lần: vé chỉ tạo ở lần đầu, số vé sau mỗi lần luôn là 3', async () => {
    const rawBody = JSON.stringify(momoIpn(ORDER_A, 4100000001));
    const statuses = [];
    const ticketsAfterEach = [];
    for (let i = 0; i < REPLAYS; i += 1) {
      statuses.push((await send(rawBody)).status);
      ticketsAfterEach.push(await tickets(ORDER_A));
    }

    expect(statuses).toEqual([200, 200, 200, 200, 200]); // MoMo luôn nhận ACK, không gửi lại mãi
    expect(ticketsAfterEach).toEqual([3, 3, 3, 3, 3]);
    expect(await soldSeats()).toEqual([1, 2, 3]);
    expect(await count('order_items')).toBe(6); // không sinh thêm dòng vé nào
    expect(await count('payment_events')).toBe(1);
    expect(await database('payment_events').first()).toMatchObject({ transaction_id: '4100000001', raw_payload: rawBody, outcome: 'processed' });
    expect(await database('orders').where({ id: ORDER_A }).first()).toMatchObject({ status: 'paid', gateway_transaction_id: '4100000001' });
    expect(await count('seat_holds', { id: HOLD_A })).toBe(0);
    expect(await tickets(ORDER_B)).toBe(0); // đơn khác không bị ảnh hưởng
    console.log(`T-47: ${REPLAYS} lần gửi, số vé sau mỗi lần = [${ticketsAfterEach.join(', ')}]`);
  });

  test('Gửi đồng thời 5 bản của cùng một webhook: vẫn chỉ 3 vé và 1 biên nhận', async () => {
    const rawBody = JSON.stringify(momoIpn(ORDER_A, 4100000002));
    const responses = await Promise.all(Array.from({ length: REPLAYS }, () => send(rawBody)));

    expect(responses.map((res) => res.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await tickets(ORDER_A)).toBe(3);
    expect(await soldSeats()).toEqual([1, 2, 3]);
    expect(await count('payment_events')).toBe(1);
  });

  test('Cùng giao dịch nhưng body khác byte (5 cách định dạng JSON, chữ ký vẫn hợp lệ): vẫn chỉ 3 vé', async () => {
    const payload = momoIpn(ORDER_A, 4100000003);
    const reversed = Object.fromEntries(Object.entries(payload).reverse());
    // Chữ ký MoMo tính trên các trường, không trên byte -> chống trùng phải dựa vào transId
    const variants = [
      JSON.stringify(payload),
      JSON.stringify(payload, null, 2),
      JSON.stringify(reversed),
      JSON.stringify(payload, null, 4),
      `${JSON.stringify(reversed)}\n`,
    ];
    expect(new Set(variants).size).toBe(REPLAYS);

    const ticketsAfterEach = [];
    for (const rawBody of variants) {
      expect((await send(rawBody)).status).toBe(200);
      ticketsAfterEach.push(await tickets(ORDER_A));
    }

    expect(ticketsAfterEach).toEqual([3, 3, 3, 3, 3]);
    expect(await count('payment_events')).toBe(1);
    expect((await database('payment_events').first()).raw_payload).toBe(variants[0]); // giữ body lần nhận đầu
  });

  test('Gửi lại xen kẽ webhook của hai đơn, mỗi đơn 5 lần: mỗi đơn đúng 3 vé, không ghế nào bán hai lần', async () => {
    const ipnA = JSON.stringify(momoIpn(ORDER_A, 4100000004));
    const ipnB = JSON.stringify(momoIpn(ORDER_B, 4100000005));
    for (let i = 0; i < REPLAYS; i += 1) {
      expect((await send(ipnA)).status).toBe(200);
      expect((await send(ipnB)).status).toBe(200);
    }

    expect(await tickets(ORDER_A)).toBe(3);
    expect(await tickets(ORDER_B)).toBe(3);
    expect(await soldSeats()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(await count('payment_events')).toBe(2);
  });

  test('Bản sao bị sửa xen giữa các lần gửi lại: bị từ chối 401, số vé không đổi', async () => {
    const payload = momoIpn(ORDER_A, 4100000006);
    const rawBody = JSON.stringify(payload);
    const forgedSignature = JSON.stringify({ ...payload, signature: 'f'.repeat(64) });
    const forgedAmount = JSON.stringify({ ...payload, amount: 1000 }); // đổi số tiền, giữ chữ ký cũ

    expect((await send(forgedSignature)).status).toBe(401); // trước khi có biên nhận
    expect(await tickets(ORDER_A)).toBe(0);
    for (let i = 0; i < REPLAYS; i += 1) {
      expect((await send(rawBody)).status).toBe(200);
      expect((await send(forgedSignature)).status).toBe(401);
      expect((await send(forgedAmount)).status).toBe(401); // biết transId cũ không thay được chữ ký
    }

    expect(await tickets(ORDER_A)).toBe(3);
    expect(await count('payment_events')).toBe(1);
    expect((await database('orders').where({ id: ORDER_A }).first()).total_amount).toBe(TOTAL);
  });
});
