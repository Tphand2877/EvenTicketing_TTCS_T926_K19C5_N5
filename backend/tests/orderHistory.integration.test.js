/**
 * S-32: xem lịch sử đơn hàng của tôi. PostgreSQL thật, migrations thật, API thật.
 */
process.env.JWT_SECRET = 's32-auth-test-only';

const crypto = require('crypto');
const path = require('path');
const jwt = require('jsonwebtoken');
const knex = require('knex');
const request = require('supertest');
const config = require('../knexfile').test;

const schema = `s32_test_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const mockDatabase = knex({
  ...config,
  connection: { ...config.connection, database: process.env.DB_NAME_TEST || config.connection.database },
  searchPath: [schema],
  pool: { min: 0, max: 5 },
});
jest.mock('../src/config/database', () => mockDatabase);
const app = require('../src/app');
const database = mockDatabase;
const describeDatabase = process.env.RUN_ORDER_HISTORY_DB_TESTS === '1' ? describe : describe.skip;

const bearer = (userId) => `Bearer ${jwt.sign({ userId, role: 'buyer', email: `u${userId}@s32.test` }, process.env.JWT_SECRET)}`;
const list = (userId, query = {}) => request(app).get('/api/orders').query(query).set('Authorization', bearer(userId));
const ids = {};
let seat = 0;

/** Tạo đơn của userId; createdMinutesAgo quyết định thứ tự mới/cũ. */
const makeOrder = async (key, userId, status, createdMinutesAgo, { overdue = false, seats = 1 } = {}) => {
  const id = crypto.randomUUID();
  ids[key] = id;
  await database('orders').insert({
    id, user_id: userId, status, total_amount: seats * 100000, currency: 'VND',
    expires_at: database.raw(`clock_timestamp() ${overdue ? '-' : '+'} interval '10 minutes'`),
    created_at: database.raw(`clock_timestamp() - interval '${createdMinutesAgo} minutes'`),
  });
  for (let i = 0; i < seats; i += 1) {
    seat += 1;
    await database('order_items').insert({ order_id: id, seat_id: seat, category_name: 'VIP', unit_price: 100000,
      released_at: ['expired', 'cancelled'].includes(status) ? database.fn.now() : null });
  }
};

describeDatabase('S-32: xem lịch sử đơn hàng của tôi', () => {
  beforeAll(async () => {
    await database.schema.createSchema(schema);
    await database.migrate.latest({ directory: path.join(__dirname, '../src/migrations') });
    await database('roles').insert({ id: 1, name: 'buyer' });
    await database('users').insert([1, 2].map((id) => ({ id, email: `u${id}@s32.test`, password_hash: 'x', role_id: 1 })));
    await database('events').insert({ id: 1, organizer_id: 1, title: 'Đêm nhạc S-32', venue: 'Nhà hát', status: 'published' });
    await database('showtimes').insert({ id: 1, event_id: 1, starts_at: '2099-01-01T12:00:00Z', capacity: 30, status: 'on_sale' });
    await database('seat_categories').insert({ id: 1, showtime_id: 1, name: 'VIP' });
    await database('seats').insert(Array.from({ length: 30 }, (_, i) => ({ id: i + 1, showtime_id: 1, category_id: 1, row_label: 'E', seat_number: i + 1 })));

    await makeOrder('paid', 1, 'paid', 50, { seats: 2 });
    await makeOrder('expired', 1, 'expired', 40);
    await makeOrder('cancelled', 1, 'cancelled', 30);
    await makeOrder('overdue', 1, 'pending', 20, { overdue: true });
    await makeOrder('review', 1, 'needs_review', 15);
    await makeOrder('pending', 1, 'pending', 10);
    await makeOrder('other', 2, 'paid', 5);
  }, 30000);

  afterAll(async () => {
    await require('../src/services/showtimePageCache').close();
    await database.schema.dropSchemaIfExists(schema, true);
    await database.destroy();
  });

  test('AC1: chỉ đơn của tôi, mới nhất trước, kèm trạng thái, sự kiện, suất, ghế, tổng tiền', async () => {
    const res = await list(1);
    expect(res.status).toBe(200);
    const { orders, pagination } = res.body.data;
    expect(orders.map((o) => o.id)).toEqual(['pending', 'review', 'overdue', 'cancelled', 'expired', 'paid'].map((k) => ids[k]));
    expect(orders.some((o) => o.id === ids.other)).toBe(false);
    expect(pagination).toMatchObject({ page: 1, totalOrders: 6 });
    const paid = orders.find((o) => o.id === ids.paid);
    expect(paid).toMatchObject({ status: 'paid', total_amount: 200000, seat_count: 2, event: { title: 'Đêm nhạc S-32' }, showtime: { id: 1 } });
    expect(paid.seats.map((s) => `${s.row_label}${s.seat_number}`)).toEqual(['E1', 'E2']);
  });

  test('AC3: đơn hết hạn và đã huỷ vẫn hiện với trạng thái của nó; đơn chờ quá hạn hiện là "expired"', async () => {
    const byId = Object.fromEntries((await list(1)).body.data.orders.map((o) => [o.id, o.status]));
    expect(byId[ids.expired]).toBe('expired');
    expect(byId[ids.cancelled]).toBe('cancelled');
    expect(byId[ids.overdue]).toBe('expired');
    expect(byId[ids.pending]).toBe('pending');
    expect(byId[ids.review]).toBe('needs_review');
  });

  test('Bộ lọc khớp với trạng thái hiển thị (đơn chờ quá hạn nằm ở "Đã hết hạn", không ở "Chờ thanh toán")', async () => {
    const filtered = async (status) => (await list(1, { status })).body.data.orders.map((o) => o.id).sort();
    expect(await filtered('pending')).toEqual([ids.pending]);
    expect(await filtered('expired')).toEqual([ids.expired, ids.overdue].sort());
    expect(await filtered('paid')).toEqual([ids.paid]);
    expect(await filtered('cancelled')).toEqual([ids.cancelled]);
    expect(await filtered('needs_review')).toEqual([ids.review]);
  });

  test('NFR: phân trang không trùng, không sót đơn', async () => {
    const pages = [];
    for (let page = 1; page <= 3; page += 1) pages.push((await list(1, { page, limit: 2 })).body.data);
    expect(pages[0].pagination).toMatchObject({ totalOrders: 6, totalPages: 3, hasNextPage: true, hasPrevPage: false });
    expect(pages[2].pagination).toMatchObject({ hasNextPage: false, hasPrevPage: true });
    const all = pages.flatMap((p) => p.orders.map((o) => o.id));
    expect(new Set(all).size).toBe(6);
  });

  test('AC2: xem chi tiết đơn của người khác -> 403; đơn của mình -> 200; mã sai -> 400/404; chưa đăng nhập -> 401', async () => {
    const mine = await request(app).get(`/api/orders/${ids.paid}`).set('Authorization', bearer(1));
    expect(mine.status).toBe(200);
    expect(mine.body.data).toMatchObject({ id: ids.paid, status: 'paid', seat_count: 2 });
    const others = await request(app).get(`/api/orders/${ids.other}`).set('Authorization', bearer(1));
    expect([others.status, others.body.code]).toEqual([403, 'ORDER_FORBIDDEN']);
    expect((await request(app).get('/api/orders/abc').set('Authorization', bearer(1))).status).toBe(400);
    expect((await request(app).get(`/api/orders/${crypto.randomUUID()}`).set('Authorization', bearer(1))).status).toBe(404);
    expect((await request(app).get('/api/orders')).status).toBe(401);
  });
});
