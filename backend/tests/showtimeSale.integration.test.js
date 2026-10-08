/**
 * S-07 (T-15) - Mở bán / đóng bán trên PostgreSQL thật: 4 AC + NFR nhật ký.
 * CI bật bằng RUN_SHOWTIME_SALE_DB_TESTS=1; chạy trong schema tạm, xoá khi xong.
 */
process.env.JWT_SECRET = 's07-integration-test-only';
const crypto = require('crypto');
const path = require('path');
const knex = require('knex');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../knexfile').test;

const schema = `s07_test_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const mockDatabase = knex({ ...config, searchPath: [schema], pool: { min: 0, max: 8 } });
jest.mock('../src/config/database', () => mockDatabase);
jest.mock('../src/models/AuditLog', () => ({ create: jest.fn().mockResolvedValue(1) }));
// Không dùng cache Redis 30 giây của T-17: các file test chạy song song dùng chung Redis,
// trang cache của file khác sẽ lẫn vào. Ở đây chỉ kiểm tra trạng thái mở bán.
jest.mock('../src/services/showtimePageCache', () => ({
  get: async () => null, set: async () => {}, close: async () => {},
}));

const app = require('../src/app');
const seatHoldService = require('../src/services/seatHoldService');

const describeDatabase = process.env.RUN_SHOWTIME_SALE_DB_TESTS === '1' ? describe : describe.skip;
const token = (userId, role) => `Bearer ${jwt.sign({ userId, role }, process.env.JWT_SECRET)}`;
const ORGANIZER = token(1, 'organizer');
const buyer = (id) => token(id, 'buyer');
const MIGRATIONS = path.join(__dirname, '../src/migrations');
const FUTURE = '2099-01-01T00:00:00Z';

const open = (id) => request(app).post(`/api/showtimes/${id}/open-sales`).set('Authorization', ORGANIZER);
const close = (id) => request(app).post(`/api/showtimes/${id}/close-sales`).set('Authorization', ORGANIZER);
const hold = (id, userId) => request(app).post(`/api/showtimes/${id}/holds`)
  .set('Authorization', buyer(userId)).send({ quantity: 1 });
const statusOf = async (id) => (await mockDatabase('showtimes').where({ id }).first('status')).status;
const logsOf = (id) => mockDatabase('showtime_status_logs').where({ showtime_id: id }).orderBy('id');

let nextShowtimeId = 100;
const createShowtime = async ({ withSeats = true, startsAt = FUTURE, eventId = 1, capacity = 50 } = {}) => {
  const id = nextShowtimeId++;
  await mockDatabase('showtimes').insert({ id, event_id: eventId, capacity, starts_at: startsAt });
  if (withSeats) {
    const [category] = await mockDatabase('seat_categories').insert({ showtime_id: id, name: 'Thường' }).returning('id');
    await mockDatabase('seats').insert(Array.from({ length: capacity }, (_, i) => ({
      showtime_id: id, category_id: category.id, row_label: 'A', seat_number: i + 1,
    })));
  }
  return id;
};

describeDatabase('S-07: mở bán / đóng bán trên PostgreSQL', () => {
  let legacyStatus;

  beforeAll(async () => {
    await mockDatabase.schema.createSchema(schema);
    await mockDatabase.migrate.latest({ directory: MIGRATIONS });
    await mockDatabase('roles').insert([{ id: 1, name: 'organizer' }, { id: 2, name: 'buyer' }]);
    await mockDatabase('users').insert([
      { id: 1, email: 's07-org@example.test', full_name: 'Ban tổ chức', password_hash: 'x', role_id: 1, is_active: true },
      ...Array.from({ length: 25 }, (_, i) => ({
        id: i + 2, email: `s07-buyer-${i}@example.test`, password_hash: 'x', role_id: 2, is_active: true,
      })),
    ]);
    await mockDatabase('events').insert([
      { id: 1, organizer_id: 1, title: 'S07 public', venue: 'Test', status: 'published' },
      { id: 2, organizer_id: 1, title: 'S07 draft event', venue: 'Test', status: 'draft' },
    ]);

    // Migration 008: suất có sẵn trước S-07 (vốn đã bán được) chuyển thành đang bán
    await mockDatabase.migrate.down({ directory: MIGRATIONS });
    await mockDatabase('showtimes').insert({ id: 1, event_id: 1, capacity: 5, starts_at: FUTURE });
    await mockDatabase.migrate.up({ directory: MIGRATIONS });
    legacyStatus = await statusOf(1);
  }, 30000);

  afterAll(async () => {
    await require('../src/services/showtimePageCache').close();
    await mockDatabase.schema.dropSchemaIfExists(schema, true);
    await mockDatabase.destroy();
  });

  test('Migration: suất có sẵn trước S-07 thành đang bán; suất tạo mới mặc định là nháp', async () => {
    expect(legacyStatus).toBe('on_sale');
    expect(await statusOf(await createShowtime())).toBe('draft');
  });

  test('AC1: nháp + có sơ đồ → mở bán → đang bán và hiện trên trang công khai', async () => {
    const id = await createShowtime();
    const visibleIds = async () => (await request(app).get('/api/events/1')).body.data.showtimes.map((s) => s.id);
    const listedIds = async () => (await request(app).get('/api/showtimes?limit=50')).body.data.showtimes.map((s) => s.id);

    expect(await visibleIds()).not.toContain(id);
    expect(await listedIds()).not.toContain(id);
    expect((await hold(id, 2)).status).toBe(404);

    const res = await open(id);
    expect(res.status).toBe(200);
    expect(res.body.data.showtime.status).toBe('on_sale');
    expect(await visibleIds()).toContain(id);
    expect(await listedIds()).toContain(id);
    expect((await hold(id, 2)).status).toBe(201);
  });

  test('AC2: chưa có sơ đồ ghế → mở bán bị chặn kèm lý do, vẫn là nháp, không ghi nhật ký', async () => {
    const id = await createShowtime({ withSeats: false });
    const res = await open(id);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'NO_SEAT_MAP', message: expect.stringContaining('chưa có sơ đồ ghế') });
    expect(await statusOf(id)).toBe('draft');
    expect(await logsOf(id)).toHaveLength(0);
  });

  test('AC3: đóng bán → không giữ chỗ mới được; hold đang có vẫn huỷ/hết hạn/được dọn bình thường', async () => {
    const id = await createShowtime();
    await open(id);
    const kept = await hold(id, 2);
    const toExpire = await hold(id, 3);
    const pendingId = crypto.randomUUID();
    await mockDatabase('seat_holds').insert({
      id: pendingId, showtime_id: id, user_id: 4, quantity: 1, status: 'pending_payment',
      order_id: `order-${pendingId}`, expires_at: mockDatabase.raw("now() + interval '5 minutes'"),
    });

    const res = await close(id);
    expect(res.status).toBe(200);
    expect(await statusOf(id)).toBe('closed');

    // Không giữ chỗ mới được
    const blocked = await hold(id, 5);
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toContain('không mở bán');

    // Suất đã đóng vẫn hiện (người mua thấy "đã đóng bán"), nhưng không còn trong danh sách đang bán
    const detail = (await request(app).get('/api/events/1')).body.data.showtimes.find((s) => s.id === id);
    expect(detail.status).toBe('closed');

    // Hold cũ vẫn huỷ được
    const release = await request(app).delete(`/api/showtimes/holds/${kept.body.data.hold.id}`).set('Authorization', buyer(2));
    expect(release.status).toBe(200);

    // Hold cũ hết hạn vẫn được job dọn
    await mockDatabase('seat_holds').where({ id: toExpire.body.data.hold.id })
      .update({ expires_at: mockDatabase.raw("clock_timestamp() - interval '1 second'") });
    expect(await seatHoldService.cleanupExpired()).toBeGreaterThanOrEqual(1);
    expect((await mockDatabase('seat_holds').where({ id: toExpire.body.data.hold.id }).first()).status).toBe('cancelled');

    // Đơn đang chờ thanh toán không bị đụng tới
    expect((await mockDatabase('seat_holds').where({ id: pendingId }).first()).status).toBe('pending_payment');
  });

  test('AC4: đóng rồi mở lại → đang bán; đổi qua lại nhiều lần được', async () => {
    const id = await createShowtime();
    for (let i = 0; i < 2; i += 1) {
      expect((await open(id)).body.data.showtime.status).toBe('on_sale');
      expect((await close(id)).body.data.showtime.status).toBe('closed');
    }
    expect((await open(id)).status).toBe(200);
    expect((await hold(id, 6)).status).toBe(201);
  });

  test('Luật chuyển trạng thái: không đóng suất nháp, không mở suất đang bán', async () => {
    const id = await createShowtime();
    expect((await close(id)).body.code).toBe('INVALID_TRANSITION');
    await open(id);
    expect((await open(id)).body.code).toBe('ALREADY_IN_STATUS');
    await close(id);
    expect((await close(id)).body.code).toBe('ALREADY_IN_STATUS');
  });

  test('Không mở bán khi sự kiện chưa công khai hoặc suất đã bắt đầu', async () => {
    const draftEvent = await createShowtime({ eventId: 2 });
    expect((await open(draftEvent)).body.code).toBe('EVENT_NOT_PUBLISHED');
    const past = await createShowtime({ startsAt: '2000-01-01T00:00:00Z' });
    expect((await open(past)).body.code).toBe('SHOWTIME_STARTED');
  });

  test('NFR: mỗi lần đổi trạng thái ghi nhật ký kèm người thao tác, không lưu email', async () => {
    const id = await createShowtime();
    await open(id);
    await close(id);
    const logs = await logsOf(id);
    expect(logs.map((l) => [l.from_status, l.to_status, l.changed_by])).toEqual([
      ['draft', 'on_sale', 1],
      ['on_sale', 'closed', 1],
    ]);
    expect(logs.every((l) => l.changed_at instanceof Date)).toBe(true);
    expect(JSON.stringify(logs)).not.toContain('@');

    const res = await request(app).get(`/api/showtimes/${id}/status-log`).set('Authorization', ORGANIZER);
    expect(res.body.data.logs[0]).toMatchObject({ from_status: 'on_sale', to_status: 'closed', changed_by_name: 'Ban tổ chức' });
  });

  test('Đồng thời: đóng bán giữa lúc 20 người bấm giữ chỗ → không lượt giữ nào được tạo sau khi đã đóng', async () => {
    const id = await createShowtime({ capacity: 50 });
    await open(id);
    const requests = Array.from({ length: 20 }, (_, i) => hold(id, i + 2));
    requests.splice(10, 0, close(id));
    const results = await Promise.all(requests);
    const closeResult = results[10];
    expect(closeResult.status).toBe(200);

    const { changed_at: closedAt } = (await logsOf(id)).at(-1);
    const holds = await mockDatabase('seat_holds').where({ showtime_id: id });
    holds.forEach((h) => expect(new Date(h.created_at).getTime()).toBeLessThanOrEqual(new Date(closedAt).getTime()));
    const holdResults = results.filter((_, i) => i !== 10);
    expect(holdResults.filter((r) => r.status === 201)).toHaveLength(holds.length);
    holdResults.filter((r) => r.status !== 201).forEach((r) => expect(r.status).toBe(409));
  });

  test('Organizer xem được mọi suất (kể cả nháp) kèm số ghế', async () => {
    const id = await createShowtime({ capacity: 7 });
    const res = await request(app).get('/api/events/1/showtimes').set('Authorization', ORGANIZER);
    expect(res.body.data.showtimes.find((s) => s.id === id)).toMatchObject({ status: 'draft', seat_count: 7, category_count: 1 });
  });
});
