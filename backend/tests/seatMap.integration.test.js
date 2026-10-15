/**
 * S-05 (T-11, T-12) - Nạp sơ đồ ghế trên PostgreSQL thật: 4 AC + NFR 2.000 ghế < 5 giây.
 * CI bật bằng RUN_SEAT_MAP_DB_TESTS=1; chạy trong schema tạm, xoá khi xong.
 */
process.env.JWT_SECRET = 's05-integration-test-only';
const crypto = require('crypto');
const path = require('path');
const knex = require('knex');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../knexfile').test;

const databaseTestsEnabled = process.env.RUN_SEAT_MAP_DB_TESTS === '1';
const testDatabaseName = process.env.DB_NAME_TEST?.trim();

const schema = `s05_test_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const mockDatabase = knex({
  ...config,
  connection: {
    ...config.connection,
    ...(testDatabaseName ? { database: testDatabaseName } : {}),
  },
  searchPath: [schema],
  pool: { min: 0, max: 8 },
});
jest.mock('../src/config/database', () => mockDatabase);
jest.mock('../src/models/AuditLog', () => ({ create: jest.fn().mockResolvedValue(1) }));

const app = require('../src/app');
const seatHoldService = require('../src/services/seatHoldService');
const { createPaymentResultRepository } = require('../src/repositories/paymentResultRepository');
const { createPaymentResultService } = require('../src/services/paymentResultService');

const describeDatabase = databaseTestsEnabled ? describe : describe.skip;
const ORGANIZER = `Bearer ${jwt.sign({ userId: 1, role: 'organizer' }, process.env.JWT_SECRET)}`;
const SHOWTIME = 1;

// Hàng A..T, mỗi hàng 100 ghế: ghế thứ 1500 là O100. 2 hàng đầu là VIP.
const twoThousandSeats = () => Array.from({ length: 2000 }, (_, i) => ({
  row: String.fromCharCode(65 + Math.floor(i / 100)),
  number: (i % 100) + 1,
  category: i < 200 ? 'VIP' : 'Thường',
}));

const upload = (seats, id = SHOWTIME) =>
  request(app).put(`/api/showtimes/${id}/seat-map`).set('Authorization', ORGANIZER).send({ seats });
const seatCount = (id = SHOWTIME) => mockDatabase('seats').where({ showtime_id: id }).count({ n: '*' }).first().then((r) => Number(r.n));
const categoryNames = (id = SHOWTIME) => mockDatabase('seat_categories').where({ showtime_id: id }).orderBy('name').pluck('name');

const createOrderAllocation = async ({ status, releasedAt = null, showtimeId = SHOWTIME }) => {
  const id = crypto.randomUUID();
  const seat = await mockDatabase('seats').where({ showtime_id: showtimeId }).first('id');
  if (!seat) throw new Error(`Test fixture has no seat for showtime ${showtimeId}.`);
  await mockDatabase('orders').insert({
    id,
    user_id: 2,
    status,
    total_amount: 275000,
    currency: 'VND',
    expires_at: '2099-01-01T00:00:00.000Z',
  });
  await mockDatabase('order_items').insert({
    order_id: id,
    seat_id: seat.id,
    category_name: 'VIP',
    unit_price: 275000,
    released_at: releasedAt,
  });
  return { id, seatId: seat.id };
};

describeDatabase('S-05: nạp sơ đồ ghế trên PostgreSQL', () => {
  beforeAll(async () => {
    await mockDatabase.schema.createSchema(schema);
    await mockDatabase.migrate.latest({ directory: path.join(__dirname, '../src/migrations') });
    await mockDatabase('roles').insert([{ id: 1, name: 'organizer' }, { id: 2, name: 'buyer' }]);
    await mockDatabase('users').insert([
      { id: 1, email: 's05-org@example.test', password_hash: 'fixture', role_id: 1, is_active: true },
      { id: 2, email: 's05-buyer@example.test', password_hash: 'fixture', role_id: 2, is_active: true },
    ]);
    await mockDatabase('events').insert({ id: 1, organizer_id: 1, title: 'S05 fixture', venue: 'Test' });
    await mockDatabase('showtimes').insert([
      { id: 1, event_id: 1, capacity: 10, starts_at: '2099-01-01T00:00:00Z', status: 'on_sale' },
      { id: 2, event_id: 1, capacity: 10, starts_at: '2099-01-01T00:00:00Z', status: 'on_sale' },
    ]);
  }, 30000);

  beforeEach(async () => {
    await mockDatabase('seat_holds').del();
    await mockDatabase('order_items').del();
    await mockDatabase('orders').del();
    await mockDatabase('seats').del();
    await mockDatabase('seat_categories').del();
  });

  afterAll(async () => {
    await mockDatabase.schema.dropSchemaIfExists(schema, true);
    await mockDatabase.destroy();
  });

  test('AC1 + NFR: tệp 2.000 ghế tạo đủ ghế, hàng, số, hạng; hạng mới được tạo; < 5 giây', async () => {
    const started = Date.now();
    const res = await upload(twoThousandSeats());
    const elapsed = Date.now() - started;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(5000);
    expect(res.body.data).toMatchObject({
      seatCount: 2000,
      replacedSeatCount: 0,
      createdCategories: ['VIP', 'Thường'],
      categories: [{ name: 'VIP', seatCount: 200 }, { name: 'Thường', seatCount: 1800 }],
    });
    expect(await seatCount()).toBe(2000);
    expect(await categoryNames()).toEqual(['Thường', 'VIP']);

    const seat = await mockDatabase('seats as s')
      .join('seat_categories as c', 'c.id', 's.category_id')
      .where({ 's.showtime_id': SHOWTIME, 's.row_label': 'O', 's.seat_number': 100 })
      .first('s.row_label', 's.seat_number', 'c.name');
    expect(seat).toEqual({ row_label: 'O', seat_number: 100, name: 'Thường' });

    // Sức chứa của suất = số ghế trong sơ đồ, để giữ chỗ theo số lượng khớp sơ đồ
    expect((await mockDatabase('showtimes').where({ id: SHOWTIME }).first()).capacity).toBe(2000);
  }, 20000);

  test('AC1: hạng đã có được dùng lại, chỉ tạo hạng còn thiếu', async () => {
    await mockDatabase('seat_categories').insert({ showtime_id: SHOWTIME, name: 'VIP' });
    const res = await upload([
      { row: 'A', number: 1, category: 'VIP' },
      { row: 'A', number: 2, category: 'Ban công' },
    ]);
    expect(res.body.data.createdCategories).toEqual(['Ban công']);
    expect(await categoryNames()).toEqual(['Ban công', 'VIP']);
  });

  test('AC2: chưa bán/giữ → sơ đồ cũ được thay toàn bộ', async () => {
    await upload(twoThousandSeats());
    const res = await upload([{ row: 'Z', number: 1, category: 'VIP' }]);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ seatCount: 1, replacedSeatCount: 2000 });
    expect(await mockDatabase('seats').where({ showtime_id: SHOWTIME }).pluck('row_label')).toEqual(['Z']);
  }, 20000);

  test('AC3: đang có người giữ chỗ → chặn kèm lý do, sơ đồ cũ giữ nguyên', async () => {
    await upload([{ row: 'A', number: 1, category: 'VIP' }, { row: 'A', number: 2, category: 'VIP' }]);
    await seatHoldService.holdSeats({ showtimeId: SHOWTIME, userId: 2, quantity: 1 });

    const res = await upload([{ row: 'B', number: 1, category: 'VIP' }]);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'SEAT_MAP_LOCKED', message: expect.stringContaining('đang có người giữ chỗ') });
    expect(await seatCount()).toBe(2);
  });

  test('AC3: đã bán vé (hold đã xác nhận) → chặn kèm lý do', async () => {
    await mockDatabase('seat_holds').insert({
      id: crypto.randomUUID(), showtime_id: SHOWTIME, user_id: 2, quantity: 1,
      status: 'confirmed', order_id: 'order-1', expires_at: mockDatabase.raw("now() - interval '1 day'"),
    });
    const res = await upload([{ row: 'A', number: 1, category: 'VIP' }]);
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('đã có vé được bán');
  });

  test('AC3: lượt giữ đã hết hạn hoặc đã huỷ không chặn việc thay sơ đồ', async () => {
    await mockDatabase('seat_holds').insert([
      { id: crypto.randomUUID(), showtime_id: SHOWTIME, user_id: 2, quantity: 1, status: 'active',
        expires_at: mockDatabase.raw("now() - interval '1 minute'") },
      { id: crypto.randomUUID(), showtime_id: SHOWTIME, user_id: 1, quantity: 1, status: 'cancelled',
        expires_at: mockDatabase.raw("now() + interval '1 minute'") },
    ]);
    expect((await upload([{ row: 'A', number: 1, category: 'VIP' }])).status).toBe(200);
  });

  test('AC3: giữ chỗ ở suất khác không ảnh hưởng', async () => {
    await seatHoldService.holdSeats({ showtimeId: 2, userId: 2, quantity: 1 });
    expect((await upload([{ row: 'A', number: 1, category: 'VIP' }])).status).toBe(200);
  });

  test('T-42: Paid Order vẫn khóa sơ đồ khi Seat Hold đã bị xóa', async () => {
    await upload([{ row: 'A', number: 1, category: 'VIP' }]);
    await createOrderAllocation({ status: 'paid' });

    const res = await upload([{ row: 'B', number: 1, category: 'VIP' }]);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'SEAT_MAP_LOCKED' });
    expect(await mockDatabase('seat_holds')).toHaveLength(0);
    expect(await mockDatabase('seats').where({ showtime_id: SHOWTIME }).pluck('row_label')).toEqual(['A']);
  });

  test.each(['pending', 'needs_review'])(
    'T-42: %s Order có allocation chưa release khóa sơ đồ',
    async (status) => {
      await upload([{ row: 'A', number: 1, category: 'VIP' }]);
      await createOrderAllocation({ status });

      const res = await upload([{ row: 'B', number: 1, category: 'VIP' }]);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SEAT_MAP_LOCKED');
      expect(await mockDatabase('seats').where({ showtime_id: SHOWTIME }).pluck('row_label')).toEqual(['A']);
    },
  );

  test('T-42: Cancelled Order đã release không còn allocation đang hoạt động; FK vẫn bảo vệ tham chiếu lịch sử', async () => {
    await upload([{ row: 'A', number: 1, category: 'VIP' }]);
    await createOrderAllocation({ status: 'cancelled', releasedAt: new Date() });

    const res = await upload([{ row: 'B', number: 1, category: 'VIP' }]);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: 'SEAT_MAP_LOCKED',
      message: expect.stringContaining('dữ liệu hiện có tham chiếu'),
    });
    expect(await mockDatabase('seats').where({ showtime_id: SHOWTIME }).pluck('row_label')).toEqual(['A']);
  });

  test('T-42: allocation của suất khác không khóa sơ đồ và suất không có allocation vẫn thay được', async () => {
    await upload([{ row: 'A', number: 1, category: 'VIP' }], 2);
    await createOrderAllocation({ status: 'paid', showtimeId: 2 });

    const res = await upload([{ row: 'B', number: 1, category: 'VIP' }]);
    expect(res.status).toBe(200);
    expect(await mockDatabase('seats').where({ showtime_id: SHOWTIME }).pluck('row_label')).toEqual(['B']);
  });

  test('T-42: thay sơ đồ đồng thời với xác nhận Paid vẫn giữ ghế đã phân bổ', async () => {
    await upload([{ row: 'A', number: 1, category: 'VIP' }]);
    const { id: orderId, seatId } = await createOrderAllocation({ status: 'pending' });
    const holdId = crypto.randomUUID();
    await mockDatabase('orders').where({ id: orderId }).update({
      gateway_provider: 'momo',
      gateway_request_id: orderId,
    });
    await mockDatabase('seat_holds').insert({
      id: holdId,
      showtime_id: SHOWTIME,
      user_id: 2,
      quantity: 1,
      status: 'pending_payment',
      order_id: orderId,
      expires_at: '2099-01-01T00:00:00.000Z',
    });

    const baseRepository = createPaymentResultRepository(mockDatabase);
    let signalOrderLocked;
    let releasePayment;
    const orderLocked = new Promise((resolve) => { signalOrderLocked = resolve; });
    const paymentGate = new Promise((resolve) => { releasePayment = resolve; });
    const repository = {
      ...baseRepository,
      withLockedOrder(args) {
        return baseRepository.withLockedOrder({
          ...args,
          operation: async (context) => {
            signalOrderLocked();
            await paymentGate;
            return args.operation(context);
          },
        });
      },
    };
    const gateway = {
      async verifyWebhook({ rawBody }) { return { payload: JSON.parse(rawBody.toString('utf8')) }; },
      async readResult(webhook) { return webhook.payload; },
    };
    const paymentService = createPaymentResultService({
      repository,
      gatewayFactory: () => gateway,
      env: { PAYMENT_PROVIDER: 'momo' },
    });
    const verified = await paymentService.verifyWebhook({
      rawBody: Buffer.from(JSON.stringify({
        providerEventId: crypto.randomUUID(),
        orderId,
        gatewayRequestId: orderId,
        gatewayTransactionId: crypto.randomUUID(),
        amountMinor: 275000,
        currency: 'VND',
        status: 'succeeded',
        occurredAt: '2026-10-14T10:00:00.000Z',
      })),
    });
    const payment = mockDatabase.transaction((trx) => paymentService.applyVerifiedResult(verified, { transaction: trx }));

    try {
      await orderLocked;
      const res = await upload([{ row: 'B', number: 1, category: 'VIP' }]);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SEAT_MAP_LOCKED');
    } finally {
      releasePayment();
    }

    await expect(payment).resolves.toMatchObject({ status: 'paid', orderId });
    expect(await mockDatabase('orders').where({ id: orderId }).first('status')).toMatchObject({ status: 'paid' });
    expect(await mockDatabase('seat_holds').where({ id: holdId })).toHaveLength(0);
    expect(await mockDatabase('order_items').where({ order_id: orderId, seat_id: seatId }).first('released_at'))
      .toMatchObject({ released_at: null });
    expect(await mockDatabase('seats').where({ showtime_id: SHOWTIME }).pluck('row_label')).toEqual(['A']);
  });

  test('AC4: lỗi khi ghi ghế thứ 1.500 → không lưu ghế nào, sơ đồ cũ và hạng ghế giữ nguyên', async () => {
    await upload([{ row: 'Z', number: 1, category: 'Cũ' }]);
    await mockDatabase.raw(`
      CREATE FUNCTION fail_at_seat_1500() RETURNS trigger AS $$
      BEGIN
        IF NEW.row_label = 'O' AND NEW.seat_number = 100 THEN
          RAISE EXCEPTION 'simulated failure at seat 1500';
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await mockDatabase.raw(`CREATE TRIGGER fail_at_seat_1500 BEFORE INSERT ON seats
      FOR EACH ROW EXECUTE FUNCTION fail_at_seat_1500()`);
    try {
      const res = await upload(twoThousandSeats());
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('simulated failure');
    } finally {
      await mockDatabase.raw('DROP TRIGGER fail_at_seat_1500 ON seats');
      await mockDatabase.raw('DROP FUNCTION fail_at_seat_1500()');
    }

    expect(await mockDatabase('seats').where({ showtime_id: SHOWTIME }).pluck('row_label')).toEqual(['Z']);
    expect(await categoryNames()).toEqual(['Cũ']);
    expect((await mockDatabase('showtimes').where({ id: SHOWTIME }).first()).capacity).toBe(1);
  }, 20000);

  test('T-11: ghế không thể gắn hạng ghế của suất diễn khác', async () => {
    const [other] = await mockDatabase('seat_categories')
      .insert({ showtime_id: 2, name: 'Khác' }).returning('id');
    await expect(mockDatabase('seats').insert({
      showtime_id: SHOWTIME, category_id: other.id, row_label: 'A', seat_number: 1,
    })).rejects.toThrow(/foreign key/);
  });

  test('T-11: không có hai ghế trùng hàng + số trong cùng suất diễn', async () => {
    const [category] = await mockDatabase('seat_categories')
      .insert({ showtime_id: SHOWTIME, name: 'VIP' }).returning('id');
    const seat = { showtime_id: SHOWTIME, category_id: category.id, row_label: 'A', seat_number: 1 };
    await mockDatabase('seats').insert(seat);
    await expect(mockDatabase('seats').insert(seat)).rejects.toThrow(/unique|duplicate/);
  });
});
