/**
 * S-15 / T-34, T-35: giá vé theo hạng ghế, chạy app thật trên PostgreSQL thật.
 * AC1 đặt giá -> sơ đồ ghế hiện đúng giá; AC2 chặn mở bán khi có hạng chưa có giá;
 * AC3 đơn đang chờ giữ giá cũ (order_items.unit_price), giá mới chỉ cho đơn sau;
 * AC4 giá phải là số nguyên không âm.
 */
process.env.JWT_SECRET = 's15-auth-test-only';

const crypto = require('crypto');
const path = require('path');
const knex = require('knex');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../knexfile').test;

const schema = `s15_test_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const mockDatabase = knex({
  ...config,
  connection: { ...config.connection, database: process.env.DB_NAME_TEST || config.connection.database },
  searchPath: [schema],
  pool: { min: 0, max: 8 },
});
jest.mock('../src/config/database', () => mockDatabase);
const app = require('../src/app');
const database = mockDatabase;
const describeDatabase = process.env.RUN_SEAT_PRICING_DB_TESTS === '1' ? describe : describe.skip;

const OWNER = `Bearer ${jwt.sign({ userId: 1, role: 'organizer' }, process.env.JWT_SECRET)}`;
const setPrices = (prices) => request(app).put('/api/showtimes/1/categories/prices').set('Authorization', OWNER).send({ prices });

describeDatabase('S-15: giá vé theo hạng ghế', () => {
  beforeAll(async () => {
    await database.schema.createSchema(schema);
    await database.migrate.latest({ directory: path.join(__dirname, '../src/migrations') });
    await database('roles').insert([{ id: 1, name: 'organizer' }, { id: 2, name: 'buyer' }]);
    await database('users').insert([{ id: 1, email: 's15-o@example.test', password_hash: 'x', role_id: 1 },
      { id: 2, email: 's15-b@example.test', password_hash: 'x', role_id: 2 }]);
    await database('events').insert({ id: 1, organizer_id: 1, title: 'S-15 test', venue: 'Test', status: 'published' });
  }, 30000);

  // Suất nháp có 2 hạng: VIP (ghế 1-2) và Thường (ghế 3-4), chưa đặt giá
  beforeEach(async () => {
    for (const table of ['order_items', 'seat_holds', 'orders', 'seats', 'seat_categories', 'showtime_status_logs', 'showtimes']) await database(table).del();
    await database('showtimes').insert({ id: 1, event_id: 1, starts_at: '2099-01-01', capacity: 4, price: 0, status: 'draft' });
    await database('seat_categories').insert([{ id: 1, showtime_id: 1, name: 'VIP' }, { id: 2, showtime_id: 1, name: 'Thường' }]);
    await database('seats').insert([1, 2, 3, 4].map((id) => ({ id, showtime_id: 1, category_id: id <= 2 ? 1 : 2, row_label: 'A', seat_number: id })));
  });

  afterAll(async () => {
    await require('../src/services/showtimePageCache').close();
    await database.schema.dropSchemaIfExists(schema, true);
    await database.destroy();
  });

  test('AC2: còn hạng chưa có giá thì không mở bán được; đặt đủ giá thì mở bán được', async () => {
    expect((await setPrices([{ id: 1, price: 500000 }])).status).toBe(200);
    const blocked = await request(app).post('/api/showtimes/1/open-sales').set('Authorization', OWNER);
    expect(blocked.status).toBeGreaterThanOrEqual(400);
    expect(blocked.body.code).toBe('CATEGORY_MISSING_PRICE');
    expect(blocked.body.message).toContain('Thường');

    expect((await setPrices([{ id: 2, price: 200000 }])).status).toBe(200);
    expect((await request(app).post('/api/showtimes/1/open-sales').set('Authorization', OWNER)).status).toBe(200);
  });

  test('AC1: đặt giá rồi mở bán -> sơ đồ ghế công khai hiện đúng giá từng ghế', async () => {
    await setPrices([{ id: 1, price: 500000 }, { id: 2, price: 200000 }]);
    await request(app).post('/api/showtimes/1/open-sales').set('Authorization', OWNER);

    const res = await request(app).get('/api/showtimes/1/seats');
    expect(res.status).toBe(200);
    expect(res.body.data.seats.map((s) => [s.id, Number(s.price), s.status])).toEqual([
      [1, 500000, 'available'], [2, 500000, 'available'], [3, 200000, 'available'], [4, 200000, 'available'],
    ]);
  });

  test('AC3: đổi giá không làm đổi đơn đang chờ; ghế của đơn đã trả hiện "sold" trên sơ đồ', async () => {
    await setPrices([{ id: 1, price: 500000 }, { id: 2, price: 200000 }]);
    await request(app).post('/api/showtimes/1/open-sales').set('Authorization', OWNER);
    const pending = crypto.randomUUID();
    const paid = crypto.randomUUID();
    await database('orders').insert([
      { id: pending, user_id: 2, status: 'pending', total_amount: 500000, currency: 'VND', expires_at: '2099-01-01' },
      { id: paid, user_id: 2, status: 'paid', total_amount: 200000, currency: 'VND', expires_at: '2099-01-01' },
    ]);
    await database('order_items').insert([
      { order_id: pending, seat_id: 1, category_name: 'VIP', unit_price: 500000 },
      { order_id: paid, seat_id: 3, category_name: 'Thường', unit_price: 200000 },
    ]);

    expect((await setPrices([{ id: 1, price: 750000 }])).status).toBe(200);

    expect(await database('order_items').where({ order_id: pending }).first()).toMatchObject({ unit_price: 500000 });
    expect(await database('orders').where({ id: pending }).first()).toMatchObject({ total_amount: 500000 });
    const categories = (await request(app).get('/api/showtimes/1/categories')).body.data.categories;
    expect(categories.find((c) => c.id === 1).price).toBe(750000); // đơn tạo sau dùng giá mới
    const seats = (await request(app).get('/api/showtimes/1/seats')).body.data.seats;
    expect(seats.find((s) => s.id === 3).status).toBe('sold');
    expect(Number(seats.find((s) => s.id === 2).price)).toBe(750000);
  });

  test('AC4: giá âm, số thực, chữ -> 400 và không lưu gì', async () => {
    for (const price of [-1, 1500.5, '1500.5', 'abc']) {
      expect((await setPrices([{ id: 1, price }])).status).toBe(400);
    }
    expect((await database('seat_categories').where({ id: 1 }).first()).price).toBeNull();
  });
});
