/**
 * S-27: vé gửi qua email kèm mã QR. Webhook MoMo ký thật -> T-42 + S-25 phát vé -> commit -> gửi email.
 * Dùng emailService thật ở chế độ không SMTP (ghi nhận email đã gửi), PostgreSQL thật.
 */
process.env.JWT_SECRET = 's27-auth-test-only';
process.env.TICKET_QR_SECRET = 's27-ticket-qr-secret-for-tests-only-0001';
process.env.PAYMENT_PROVIDER = 'momo';
process.env.MOMO_PARTNER_CODE = 'S27TEST';
process.env.MOMO_ACCESS_KEY = 's27-access-key';
process.env.MOMO_SECRET_KEY = 's27-secret-key-test-only';
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

const schema = `s27_test_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const mockDatabase = knex({
  ...config,
  connection: { ...config.connection, database: process.env.DB_NAME_TEST || config.connection.database },
  searchPath: [schema],
  pool: { min: 0, max: 10 },
});
jest.mock('../src/config/database', () => mockDatabase);
const app = require('../src/app');
const emailService = require('../src/services/emailService');
const { createTicketEmailDispatcher, MAX_ATTEMPTS } = require('../src/services/ticketNotificationService');
const database = mockDatabase;
const describeDatabase = process.env.RUN_TICKET_EMAIL_DB_TESTS === '1' ? describe : describe.skip;

const ORDER = '27000000-0000-4000-8000-00000000000a';
const OTHER = '27000000-0000-4000-8000-00000000000b';
const PRICE = 120000;
const bearer = (userId) => `Bearer ${jwt.sign({ userId, role: 'buyer', email: `u${userId}@s27.test` }, process.env.JWT_SECRET)}`;
const dispatcher = () => createTicketEmailDispatcher({ database });
const ticketEmails = () => emailService.getSentTicketEmails();
const order = (id) => database('orders').where({ id }).first();

const momoIpn = (orderId, transId, amount, resultCode = 0) => {
  const payload = {
    partnerCode: process.env.MOMO_PARTNER_CODE, orderId, requestId: orderId, amount,
    orderInfo: 'Thanh toan ve', orderType: 'momo_wallet', transId, resultCode,
    message: resultCode === 0 ? 'Successful.' : 'Failed.', payType: 'qr', responseTime: 1792000000000, extraData: '',
  };
  payload.signature = sign(process.env.MOMO_SECRET_KEY, createWebhookSignatureData(payload, process.env.MOMO_ACCESS_KEY));
  return JSON.stringify(payload);
};
const pay = (orderId, transId, seats, resultCode = 0) => request(app).post('/api/payments/webhook')
  .set('Content-Type', 'application/json').send(momoIpn(orderId, transId, seats * PRICE, resultCode));
/** Email được gửi sau khi trả 200 cho cổng thanh toán: chờ tới khi lượt gửi xong (đã gửi hoặc đã nhả việc). */
const waitForDispatch = async (orderId) => {
  for (let i = 0; i < 200; i += 1) {
    const row = await order(orderId);
    if (row.ticket_email_attempts > 0 && !row.ticket_email_claimed_at) return row;
    await new Promise((resolve) => { setTimeout(resolve, 50); });
  }
  throw new Error('Ticket email dispatch did not finish.');
};
const waitForEmail = async (orderId) => {
  const row = await waitForDispatch(orderId);
  if (!row.ticket_email_sent_at) throw new Error('Ticket email was not sent.');
};

const insertPendingOrder = async (id, userId, seatIds) => {
  await database('orders').insert({
    id, user_id: userId, status: 'pending', total_amount: seatIds.length * PRICE, currency: 'VND', expires_at: '2099-01-01',
    gateway_provider: 'momo', gateway_request_id: id, payment_request_status: 'ready',
    payment_url: 'https://test-payment.momo.vn/v2/gateway/pay?t=s27', payment_request_started_at: database.fn.now(),
  });
  await database('order_items').insert(seatIds.map((seatId) => ({ order_id: id, seat_id: seatId, category_name: 'VIP', unit_price: PRICE })));
  await database('seat_holds').insert({ id: crypto.randomUUID(), order_id: id, user_id: userId, showtime_id: 1,
    quantity: seatIds.length, status: 'pending_payment', expires_at: '2099-01-01' });
};

describeDatabase('S-27: vé điện tử được gửi qua email kèm mã QR', () => {
  beforeAll(async () => {
    await database.schema.createSchema(schema);
    await database.migrate.latest({ directory: path.join(__dirname, '../src/migrations') });
    await database('roles').insert({ id: 1, name: 'buyer' });
    await database('users').insert([
      { id: 1, email: 'nguoi.mua@s27.test', full_name: 'Nguyễn <b>Mua</b>', password_hash: 'x', role_id: 1 },
      { id: 2, email: 'khac@s27.test', password_hash: 'x', role_id: 1 },
    ]);
    await database('events').insert({ id: 1, organizer_id: 1, title: 'Live <script>alert(1)</script> Show', venue: 'Nhà hát & Sân khấu', status: 'published' });
    await database('showtimes').insert({ id: 1, event_id: 1, starts_at: '2099-01-01T12:00:00Z', capacity: 6, price: PRICE, status: 'on_sale' });
    await database('seat_categories').insert({ id: 1, showtime_id: 1, name: 'VIP' });
    await database('seats').insert([1, 2, 3, 4, 5, 6].map((id) => ({ id, showtime_id: 1, category_id: 1, row_label: 'D', seat_number: id })));
  }, 30000);

  beforeEach(async () => {
    jest.restoreAllMocks();
    emailService.clearSentEmails();
    for (const table of ['tickets', 'payment_events', 'seat_holds', 'order_items', 'orders']) await database(table).del();
    await insertPendingOrder(ORDER, 1, [1, 2, 3]);
    await insertPendingOrder(OTHER, 2, [4, 5]);
  });

  afterAll(async () => {
    await require('../src/services/showtimePageCache').close();
    await database.schema.dropSchemaIfExists(schema, true);
    await database.destroy();
  });

  test('AC: thanh toán thành công -> 1 email tới người mua, mỗi vé một ảnh QR đính kèm, QR là mã vé thật có chữ ký', async () => {
    expect((await pay(ORDER, 2700000001, 3)).status).toBe(200);
    await waitForEmail(ORDER);

    expect(ticketEmails()).toHaveLength(1);
    const [mail] = ticketEmails();
    expect(mail).toMatchObject({ to: 'nguoi.mua@s27.test', orderId: ORDER, ticketCount: 3 });
    expect(mail.tickets.map((t) => t.seat)).toEqual(['D1', 'D2', 'D3']);
    const issued = (await database('tickets').where({ order_id: ORDER }).pluck('id')).sort();
    expect(mail.tickets.map((t) => verifyTicketCode(t.qrCode).ticketId).sort()).toEqual(issued);
    // Ảnh QR là PNG đính kèm inline (cid:), không dùng data: URL (Gmail chặn)
    expect(mail.attachments).toHaveLength(3);
    for (const t of mail.tickets) expect(mail.html).toContain(`cid:${t.cid}`);
    expect(mail.attachments.every((a) => a.bytes > 100 && a.filename.endsWith('.png'))).toBe(true);
    expect(mail.html).not.toContain('data:image');
    expect((await order(ORDER)).ticket_email_attempts).toBe(1);
  });

  test('Tên sự kiện / người mua được escape trong HTML email', async () => {
    await pay(ORDER, 2700000002, 3);
    await waitForEmail(ORDER);
    const { html } = ticketEmails()[0];
    expect(html).not.toContain('<script>');
    expect(html).toContain('Live &lt;script&gt;alert(1)&lt;/script&gt; Show');
    expect(html).toContain('Nguyễn &lt;b&gt;Mua&lt;/b&gt;');
  });

  test('Webhook gửi lại 5 lần, job chạy thêm, 5 bộ gửi chạy song song -> vẫn chỉ 1 email', async () => {
    for (let i = 0; i < 5; i += 1) await pay(ORDER, 2700000003, 3);
    await waitForEmail(ORDER);
    await Promise.all([...Array.from({ length: 5 }, () => dispatcher().dispatchPending()), dispatcher().dispatchOrder(ORDER)]);
    expect(ticketEmails()).toHaveLength(1);
  });

  test('Thanh toán thất bại hoặc chưa thanh toán -> không gửi email', async () => {
    await pay(ORDER, 2700000004, 3, 1006);
    expect(await dispatcher().dispatchOrder(ORDER)).toBe(false);
    expect(await dispatcher().dispatchPending()).toBe(0);
    expect((await order(ORDER)).ticket_email_attempts).toBe(0);
    expect(ticketEmails()).toHaveLength(0);
  });

  test('SMTP lỗi -> thanh toán vẫn thành công, job gửi lại được; quá 5 lần thì dừng thử', async () => {
    const spy = jest.spyOn(emailService, 'sendTicketEmail').mockRejectedValueOnce(new Error('SMTP down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect((await pay(ORDER, 2700000005, 3)).status).toBe(200);
    await waitForDispatch(ORDER);
    expect(await order(ORDER)).toMatchObject({ status: 'paid', ticket_email_sent_at: null, ticket_email_attempts: 1, ticket_email_claimed_at: null });

    expect(await dispatcher().dispatchPending()).toBe(1); // lần thử lại thành công
    expect(spy).toHaveBeenCalledTimes(2);
    expect((await order(ORDER)).ticket_email_sent_at).not.toBeNull();

    // Đơn khác lỗi liên tục: dừng sau MAX_ATTEMPTS lần, không gửi mãi
    spy.mockRejectedValue(new Error('SMTP down'));
    await pay(OTHER, 2700000006, 2);
    await waitForDispatch(OTHER);
    for (let i = 0; i < MAX_ATTEMPTS + 2; i += 1) await dispatcher().dispatchPending();
    expect((await order(OTHER)).ticket_email_attempts).toBe(MAX_ATTEMPTS);
  }, 30000);

  test('Gửi lại vé qua email: chỉ chủ đơn, đơn đã thanh toán, cách lần trước ≥ 60 giây', async () => {
    await pay(ORDER, 2700000007, 3);
    await waitForEmail(ORDER);
    const url = `/api/tickets/orders/${ORDER}/email`;

    expect((await request(app).post(url).set('Authorization', bearer(1))).body.code).toBe('EMAIL_RECENTLY_SENT');
    await database('orders').where({ id: ORDER }).update({ ticket_email_sent_at: database.raw("clock_timestamp() - interval '2 minutes'") });
    const resent = await request(app).post(url).set('Authorization', bearer(1));
    expect(resent.status).toBe(200);
    expect(ticketEmails()).toHaveLength(2);

    expect((await request(app).post(url).set('Authorization', bearer(2))).status).toBe(403);
    expect((await request(app).post(url)).status).toBe(401);
    const unpaid = await request(app).post(`/api/tickets/orders/${OTHER}/email`).set('Authorization', bearer(2));
    expect([unpaid.status, unpaid.body.code]).toEqual([409, 'ORDER_NOT_PAID']);
  });
});
