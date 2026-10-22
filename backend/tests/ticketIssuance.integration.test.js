/**
 * S-25 / S-26: thanh toán thành công qua webhook MoMo thật -> mỗi ghế nhận một vé điện tử,
 * người mua xem được vé kèm QR có chữ ký; QR giải ra đúng mã vé trong DB.
 */
process.env.JWT_SECRET = 's25-auth-test-only';
process.env.TICKET_QR_SECRET = 's26-ticket-qr-secret-for-tests-only-0001';
process.env.PAYMENT_PROVIDER = 'momo';
process.env.MOMO_PARTNER_CODE = 'S25TEST';
process.env.MOMO_ACCESS_KEY = 's25-access-key';
process.env.MOMO_SECRET_KEY = 's25-secret-key-test-only';
process.env.MOMO_REDIRECT_URL = 'http://localhost:8080/payment/return';
process.env.MOMO_IPN_URL = 'http://localhost:3000/api/payments/webhook';

const crypto = require('crypto');
const path = require('path');
const jwt = require('jsonwebtoken');
const knex = require('knex');
const request = require('supertest');
const config = require('../knexfile').test;
const { createWebhookSignatureData, sign } = require('../src/payments/adapters/MoMoGateway');
const { verifyTicketCode } = require('../src/utils/ticketQr');

const schema = `s25_test_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const mockDatabase = knex({
  ...config,
  connection: { ...config.connection, database: process.env.DB_NAME_TEST || config.connection.database },
  searchPath: [schema],
  pool: { min: 0, max: 8 },
});
jest.mock('../src/config/database', () => mockDatabase);
const app = require('../src/app');
const database = mockDatabase;
const describeDatabase = process.env.RUN_TICKET_DB_TESTS === '1' ? describe : describe.skip;

const ORDER = '25000000-0000-4000-8000-00000000000a';
const OTHER_ORDER = '25000000-0000-4000-8000-00000000000b';
const PRICE = 150000;
const tokenFor = (userId) => `Bearer ${jwt.sign({ userId, role: 'buyer', email: `u${userId}@x.test` }, process.env.JWT_SECRET)}`;

const momoIpn = (orderId, transId, amount, resultCode = 0) => {
  const payload = {
    partnerCode: process.env.MOMO_PARTNER_CODE, orderId, requestId: orderId, amount,
    orderInfo: 'Thanh toan ve', orderType: 'momo_wallet', transId, resultCode,
    message: resultCode === 0 ? 'Successful.' : 'Failed.', payType: 'qr', responseTime: 1792000000000, extraData: '',
  };
  payload.signature = sign(process.env.MOMO_SECRET_KEY, createWebhookSignatureData(payload, process.env.MOMO_ACCESS_KEY));
  return JSON.stringify(payload);
};
const webhook = (body) => request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').send(body);

const insertPendingOrder = async (id, userId, seatIds) => {
  await database('orders').insert({
    id, user_id: userId, status: 'pending', total_amount: seatIds.length * PRICE, currency: 'VND', expires_at: '2099-01-01',
    gateway_provider: 'momo', gateway_request_id: id, payment_request_status: 'ready',
    payment_url: 'https://test-payment.momo.vn/v2/gateway/pay?t=s25', payment_request_started_at: database.fn.now(),
  });
  await database('order_items').insert(seatIds.map((seatId) => ({ order_id: id, seat_id: seatId, category_name: 'VIP', unit_price: PRICE })));
  await database('seat_holds').insert({
    id: crypto.randomUUID(), order_id: id, user_id: userId, showtime_id: 1, quantity: seatIds.length,
    status: 'pending_payment', expires_at: '2099-01-01',
  });
};

describeDatabase('S-25 / S-26: phát vé điện tử có QR ký sau khi thanh toán', () => {
  beforeAll(async () => {
    await database.schema.createSchema(schema);
    await database.migrate.latest({ directory: path.join(__dirname, '../src/migrations') });
    await database('roles').insert({ id: 1, name: 'buyer' });
    await database('users').insert([1, 2].map((id) => ({ id, email: `s25-${id}@example.test`, password_hash: 'fixture', role_id: 1 })));
    await database('events').insert({ id: 1, organizer_id: 1, title: 'Đêm nhạc S-25', venue: 'Nhà hát Lớn', status: 'published' });
    await database('showtimes').insert({ id: 1, event_id: 1, starts_at: '2099-01-01T12:00:00Z', capacity: 6, price: PRICE, status: 'on_sale' });
    await database('seat_categories').insert({ id: 1, showtime_id: 1, name: 'VIP' });
    await database('seats').insert([1, 2, 3, 4, 5, 6].map((id) => ({ id, showtime_id: 1, category_id: 1, row_label: 'B', seat_number: id })));
  }, 30000);

  beforeEach(async () => {
    for (const table of ['tickets', 'payment_events', 'seat_holds', 'order_items', 'orders']) await database(table).del();
    await insertPendingOrder(ORDER, 1, [1, 2, 3]);
    await insertPendingOrder(OTHER_ORDER, 2, [4, 5]);
  });

  afterAll(async () => {
    await require('../src/services/showtimePageCache').close();
    await database.schema.dropSchemaIfExists(schema, true);
    await database.destroy();
  });

  test('AC: thanh toán thành công -> mỗi ghế đúng 1 vé, gửi lại webhook không sinh thêm vé', async () => {
    const ipn = momoIpn(ORDER, 2500000001, 3 * PRICE);
    for (let i = 0; i < 3; i += 1) expect((await webhook(ipn)).status).toBe(200);

    const tickets = await database('tickets').where({ order_id: ORDER }).orderBy('seat_id');
    expect(tickets.map((t) => t.seat_id)).toEqual([1, 2, 3]);
    expect(tickets.every((t) => t.user_id === 1 && t.showtime_id === 1 && t.status === 'valid')).toBe(true);
    expect(await database('tickets').where({ order_id: OTHER_ORDER })).toHaveLength(0);
  });

  test('AC: thanh toán thất bại hoặc chưa thanh toán -> không có vé, API trả ORDER_NOT_PAID', async () => {
    expect((await webhook(momoIpn(ORDER, 2500000002, 3 * PRICE, 1006))).status).toBe(200);
    expect(await database('tickets')).toHaveLength(0);

    const res = await request(app).get(`/api/tickets/orders/${ORDER}`).set('Authorization', tokenFor(1));
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'ORDER_NOT_PAID', details: { status: 'pending' } });
  });

  test('AC: người mua xem vé của đơn kèm QR; QR giải ra đúng mã vé đã lưu', async () => {
    await webhook(momoIpn(ORDER, 2500000003, 3 * PRICE));
    const res = await request(app).get(`/api/tickets/orders/${ORDER}`).set('Authorization', tokenFor(1));

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const { tickets } = res.body.data;
    expect(tickets.map((t) => t.seat.label)).toEqual(['B1', 'B2', 'B3']);
    expect(tickets[0]).toMatchObject({
      status: 'valid', category: 'VIP', price: PRICE, currency: 'VND',
      event: { title: 'Đêm nhạc S-25', venue: 'Nhà hát Lớn' }, showtime: { id: 1 },
    });
    expect(tickets[0].qrImage).toMatch(/^data:image\/png;base64,/);
    const stored = (await database('tickets').where({ order_id: ORDER }).pluck('id')).sort();
    expect(tickets.map((t) => verifyTicketCode(t.qrCode)).map((r) => r.valid && r.ticketId).sort()).toEqual(stored);
  });

  test('AC: "Vé của tôi" chỉ có vé của chính người mua', async () => {
    await webhook(momoIpn(ORDER, 2500000004, 3 * PRICE));
    await webhook(momoIpn(OTHER_ORDER, 2500000005, 2 * PRICE));

    const mine = await request(app).get('/api/tickets').set('Authorization', tokenFor(2));
    expect(mine.status).toBe(200);
    expect(mine.body.data.tickets.map((t) => t.seat.label)).toEqual(['B4', 'B5']);
    expect(mine.body.data.tickets.every((t) => t.orderId === OTHER_ORDER)).toBe(true);
  });

  test('Bảo mật: xem vé đơn của người khác -> 403; chưa đăng nhập -> 401; mã đơn sai -> 400/404', async () => {
    await webhook(momoIpn(ORDER, 2500000006, 3 * PRICE));
    expect((await request(app).get(`/api/tickets/orders/${ORDER}`).set('Authorization', tokenFor(2))).status).toBe(403);
    expect((await request(app).get(`/api/tickets/orders/${ORDER}`)).status).toBe(401);
    expect((await request(app).get('/api/tickets/orders/abc').set('Authorization', tokenFor(1))).status).toBe(400);
    expect((await request(app).get('/api/tickets/orders/25000000-0000-4000-8000-0000000000ff')
      .set('Authorization', tokenFor(1))).status).toBe(404);
  });

  test('Không phát đủ vé thì không ghi nhận thanh toán (cùng transaction)', async () => {
    // Dữ liệu sai: ghế B3 của đơn đã bị gắn vé khác -> chỉ phát được 2/3 vé -> rollback, đơn vẫn pending
    const itemId = (await database('order_items').where({ order_id: ORDER, seat_id: 3 }).first()).id;
    await database('tickets').insert({ id: crypto.randomUUID(), order_id: OTHER_ORDER, order_item_id: itemId, seat_id: 3, showtime_id: 1, user_id: 2 });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await webhook(momoIpn(ORDER, 2500000007, 3 * PRICE));
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect((await database('orders').where({ id: ORDER }).first()).status).toBe('pending');
    expect(await database('payment_events').where({ order_id: ORDER })).toHaveLength(0);
    expect(await database('tickets').where({ order_id: ORDER })).toHaveLength(0);
    console.error.mockRestore();
  });
});
