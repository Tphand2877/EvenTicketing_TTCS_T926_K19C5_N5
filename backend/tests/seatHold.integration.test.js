/** Real PostgreSQL tests. CI enables these; database errors must fail the suite. */
process.env.JWT_SECRET = 's12-integration-test-only';
const crypto = require('crypto');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const knex = require('knex');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../knexfile').test;
const schema = `s12_test_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const mockDatabase = knex({ ...config, searchPath: [schema], pool: { min: 0, max: 8 } });
jest.mock('../src/config/database', () => mockDatabase);
const app = require('../src/app');
const service = require('../src/services/seatHoldService');
const { startSeatHoldCleanupJob } = require('../src/jobs/seatHoldCleanupJob');
const runFile = promisify(execFile);
const describeDatabase = process.env.RUN_SEAT_HOLD_DB_TESTS === '1' ? describe : describe.skip;
const token = (id) => `Bearer ${jwt.sign({ userId: id, role: 'buyer' }, process.env.JWT_SECRET)}`;
const createHold = (userId = 2, args = {}) => service.holdSeats({ showtimeId: 1, userId, quantity: 1, ...args });
const stored = (id) => mockDatabase('seat_holds').where({ id }).first();
const expire = (id) => mockDatabase('seat_holds').where({ id })
  .update({ expires_at: mockDatabase.raw("clock_timestamp() - interval '1 second'") });
const child = (action, args = {}) => runFile(process.execPath,
  [path.join(__dirname, 'helpers/seatHoldProcess.js'), action, JSON.stringify(args)], {
    env: { ...process.env, INTEGRATION_TEST_SCHEMA: schema }, timeout: 15000,
  }).then(({ stdout }) => JSON.parse(stdout));

describeDatabase('SCRUM-176: PostgreSQL expiry and concurrency', () => {
  beforeAll(async () => {
    await mockDatabase.schema.createSchema(schema);
    await mockDatabase.migrate.latest({ directory: path.join(__dirname, '../src/migrations') });
    await mockDatabase('roles').insert({ id: 1, name: 'buyer' });
    await mockDatabase('users').insert(Array.from({ length: 25 }, (_, i) => ({
      id: i + 1, email: `s12-${i}@example.test`, password_hash: 'fixture', role_id: 1, is_active: true,
    })));
    await mockDatabase('events').insert({ id: 1, organizer_id: 1, title: 'S12 fixture', venue: 'Test' });
    await mockDatabase('showtimes').insert([
      { id: 1, event_id: 1, capacity: 1, starts_at: '2099-01-01T00:00:00Z' },
      { id: 2, event_id: 1, capacity: 10, starts_at: '2099-01-01T00:00:00Z' },
    ]);
    await mockDatabase.raw(`
      CREATE TYPE sale_status AS ENUM ('draft', 'on_sale', 'closed');
      ALTER TABLE showtimes ADD COLUMN status sale_status NOT NULL DEFAULT 'on_sale';
      CREATE TABLE seat_categories (
        id integer PRIMARY KEY, showtime_id integer NOT NULL REFERENCES showtimes,
        name text NOT NULL, price integer);
      CREATE TABLE seats (
        id integer PRIMARY KEY, showtime_id integer NOT NULL REFERENCES showtimes,
        row_label text NOT NULL, seat_number integer NOT NULL,
        category_id integer REFERENCES seat_categories,
        UNIQUE(showtime_id, row_label, seat_number));
      CREATE TABLE fixture_tickets (
        id serial PRIMARY KEY, showtime_id integer NOT NULL, seat_id integer NOT NULL,
        status text NOT NULL);
      CREATE VIEW public_sold_seats AS
        SELECT showtime_id, seat_id FROM fixture_tickets WHERE status = 'confirmed';
    `);
    await mockDatabase('seat_categories').insert({ id: 1, showtime_id: 1, name: 'Standard', price: 100000 });
    await mockDatabase('seats').insert([
      { id: 1, showtime_id: 1, row_label: 'A', seat_number: 1, category_id: 1 },
      { id: 2, showtime_id: 1, row_label: 'A', seat_number: 2, category_id: 1 },
      { id: 3, showtime_id: 1, row_label: 'A', seat_number: 3, category_id: 1 },
      { id: 4, showtime_id: 2, row_label: 'A', seat_number: 1, category_id: null },
    ]);
  }, 30000);
  beforeEach(async () => {
    await mockDatabase('seat_holds').del();
    await mockDatabase('fixture_tickets').del();
    await mockDatabase('showtimes').update({ status: 'on_sale', starts_at: '2099-01-01T00:00:00Z' });
  });
  afterAll(async () => {
    await mockDatabase.schema.dropSchemaIfExists(schema, true);
    await mockDatabase.destroy();
  });

  test('AC1/NFR: cleanup cancels only expired active rows and preserves cancellation history', async () => {
    const hold = await createHold();
    const live = await createHold(3, { showtimeId: 2 });
    await expire(hold.id);
    expect(await service.cleanupExpired()).toBe(1);
    const snapshot = await stored(hold.id);
    expect(snapshot.status).toBe('cancelled');
    expect(snapshot.cancelled_at).toBeInstanceOf(Date);
    expect(await service.cleanupExpired()).toBe(0);
    expect(await stored(hold.id)).toEqual(snapshot);
    expect((await stored(live.id)).status).toBe('active');
  });
  test('AC2: public API returns expired places as free without changing the stored hold', async () => {
    const hold = await createHold();
    await expire(hold.id);
    const res = await request(app).get('/api/showtimes/1/availability');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ capacity: 1, held: 0, available: 1 });
    expect((await stored(hold.id)).status).toBe('active');
    expect((await createHold(3)).id).not.toBe(hold.id);
  });
  test('Exact expiry is free/cancelled; the preceding millisecond remains held', async () => {
    const hold = await createHold();
    const expiry = Date.parse(hold.expiresAt);
    expect(await service.getAvailability({ showtimeId: 1, capacity: 1, now: expiry - 1 })).toMatchObject({ held: 1 });
    expect(await service.cleanupExpired({ now: expiry - 1 })).toBe(0);
    expect(await service.getAvailability({ showtimeId: 1, capacity: 1, now: expiry })).toMatchObject({ held: 0 });
    expect(await service.cleanupExpired({ now: expiry })).toBe(1);
  });
  test('AC3: fresh process clears the entire old backlog and preserves a live hold', async () => {
    const live = await createHold();
    const shows = Array.from({ length: 150 }, (_, i) => ({
      id: i + 10, event_id: 1, capacity: 1, starts_at: '2099-01-01T00:00:00Z',
    }));
    await mockDatabase('showtimes').insert(shows);
    await mockDatabase('seat_holds').insert(shows.map((s) => ({
      id: crypto.randomUUID(), showtime_id: s.id, user_id: 3, quantity: 1, status: 'active', expires_at: new Date(0),
    })));
    expect(await child('startup')).toEqual({ remainingExpired: 0 });
    expect((await stored(live.id)).status).toBe('active');
    expect(await service.getAvailability({ showtimeId: 1, capacity: 1 })).toMatchObject({ held: 1 });
  }, 20000);
  test('AC4: pending-payment and confirmed places stay blocked after TTL/cleanup', async () => {
    const pending = await createHold();
    await mockDatabase('seat_holds').where({ id: pending.id }).update({ status: 'pending_payment', order_id: 'existing-pending-order' });
    await expire(pending.id);
    const confirmed = await createHold(3, { showtimeId: 2 });
    await mockDatabase('seat_holds').where({ id: confirmed.id }).update({ status: 'confirmed', order_id: 'existing-confirmed-order' });
    await expire(confirmed.id);
    const before = await mockDatabase('seat_holds').orderBy('id');
    expect(await service.cleanupExpired()).toBe(0);
    expect(await mockDatabase('seat_holds').orderBy('id')).toEqual(before);
    const res = await request(app).get('/api/showtimes/1/availability');
    expect(res.body.data).toEqual({ capacity: 1, held: 1, available: 0 });
    expect((await request(app).post('/api/showtimes/1/holds').set('Authorization', token(4)).send({ quantity: 1 })).status).toBe(409);
    expect(await service.releaseHold({ holdId: pending.id, userId: 2 })).toBe('not_found');
  });
  test('20 concurrent buyers get exactly one allocation of the expired final place', async () => {
    const old = await createHold();
    await expire(old.id);
    const responses = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      request(app).post('/api/showtimes/1/holds').set('Authorization', token(i + 3)).send({ quantity: 1 })));
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(19);
    expect(await service.getAvailability({ showtimeId: 1, capacity: 1 })).toEqual({ capacity: 1, held: 1, available: 0 });
    await service.cleanupExpired();
    expect(await mockDatabase('seat_holds').where({ showtime_id: 1, status: 'active' })).toHaveLength(1);
  });
  test('Independent backend processes share a lock and cannot overallocate', async () => {
    const results = await Promise.all([child('hold', { userId: 2 }), child('hold', { userId: 3 })]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(results.filter((r) => r.code === 'INSUFFICIENT_SEATS')).toHaveLength(1);
    expect(await mockDatabase('seat_holds').where({ showtime_id: 1, status: 'active' })).toHaveLength(1);
  }, 20000);
  test('Concurrent cleanup cancels once and preserves a new replacement hold', async () => {
    const old = await createHold();
    await expire(old.id);
    const [counts, replacement] = await Promise.all([
      Promise.all(Array.from({ length: 8 }, () => service.cleanupExpired())), createHold(3),
    ]);
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(1);
    expect((await stored(replacement.id)).status).toBe('active');
    expect(await service.getAvailability({ showtimeId: 1, capacity: 1 })).toMatchObject({ available: 0 });
  });
  test('Concurrent cleanup jobs preserve an expired allocation already assigned to an order', async () => {
    const hold = await createHold();
    await mockDatabase('seat_holds').where({ id: hold.id }).update({ status: 'pending_payment', order_id: 'existing-order' });
    await expire(hold.id);
    const snapshot = await stored(hold.id);
    const counts = await Promise.all(Array.from({ length: 8 }, () => service.cleanupExpired()));
    expect(counts.every((n) => n === 0)).toBe(true);
    expect(await stored(hold.id)).toEqual(snapshot);
    expect(await service.getAvailability({ showtimeId: 1, capacity: 1 })).toMatchObject({ available: 0 });
  });
  test('Simultaneous requests from the same buyer leave only one active hold', async () => {
    await Promise.all(Array.from({ length: 10 }, () => createHold()));
    expect(await mockDatabase('seat_holds').where({ showtime_id: 1, status: 'active' })).toHaveLength(1);
  });
  test('Capacity enforcement reads the database rather than caller-provided capacity', async () => {
    await createHold(2, { capacity: 9999 });
    await expect(createHold(3, { capacity: 9999 })).rejects.toMatchObject({ code: 'INSUFFICIENT_SEATS' });
  });
  test('Startup job removes persisted expired holds without any HTTP activity', async () => {
    const hold = await createHold();
    await expire(hold.id);
    const job = startSeatHoldCleanupJob();
    try {
      await job.ready;
      expect((await stored(hold.id)).status).toBe('cancelled');
    } finally { await job.stop(); }
  });
  test('Migration rollback/reapply works on PostgreSQL', async () => {
    const seatMapMigration = require('../src/migrations/007_create_seat_hold_seats');
    const migration = require('../src/migrations/006_create_seat_holds');
    await seatMapMigration.down(mockDatabase);
    await migration.down(mockDatabase);
    expect(await mockDatabase.schema.hasTable('seat_holds')).toBe(false);
    await migration.up(mockDatabase);
    expect(await mockDatabase.schema.hasTable('seat_holds')).toBe(true);
    await seatMapMigration.up(mockDatabase);
  });

  test('S-10 T-23: choosing seats creates one shared DB deadline and the public map shows them held', async () => {
    const first = await request(app)
      .post('/api/showtimes/1/seat-holds')
      .set('Authorization', token(2))
      .send({ seatIds: [1, 2] });
    expect(first.status).toBe(201);
    expect(first.body.data.hold).toMatchObject({
      showtimeId: 1,
      seatIds: [1, 2],
      quantity: 2,
    });
    expect(Number.isFinite(Date.parse(first.body.data.hold.expiresAt))).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await request(app)
      .post('/api/showtimes/1/seat-holds')
      .set('Authorization', token(2))
      .send({ seatIds: [1, 2, 3] });
    expect(second.status).toBe(200);
    expect(second.body.data.hold.id).toBe(first.body.data.hold.id);
    expect(second.body.data.hold.expiresAt).toBe(first.body.data.hold.expiresAt);

    const map = await request(app).get('/api/showtimes/1/seats');
    expect(map.status).toBe(200);
    expect(map.body.data.seats.filter((seat) => [1, 2, 3].includes(seat.id))
      .every((seat) => seat.status === 'held')).toBe(true);
    const clock = await request(app).get('/api/showtimes/1/server-time');
    expect(clock.status).toBe(200);
    expect(Number.isFinite(Date.parse(clock.body.data.serverNow))).toBe(true);
  });

  test('S-10 AC2: a sold seat rejects the whole selection without keeping a partial hold', async () => {
    await mockDatabase('fixture_tickets').insert({ showtime_id: 1, seat_id: 2, status: 'confirmed' });
    const response = await request(app)
      .post('/api/showtimes/1/seat-holds')
      .set('Authorization', token(2))
      .send({ seatIds: [1, 2] });
    expect(response.status).toBe(409);
    expect(await mockDatabase('seat_holds').where({ showtime_id: 1, user_id: 2 })).toHaveLength(0);
    expect(await mockDatabase('seat_hold_seats').where({ showtime_id: 1 })).toHaveLength(0);
  });

  test('S-10: an unassigned legacy quantity hold blocks seat-specific holds until it expires', async () => {
    await createHold(3);
    const response = await request(app)
      .post('/api/showtimes/1/seat-holds')
      .set('Authorization', token(2))
      .send({ seatIds: [1] });
    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/chưa gắn với mã ghế/i);
    expect(await mockDatabase('seat_hold_seats').where({ showtime_id: 1 })).toHaveLength(0);
  });

  test('S-10: the legacy quantity endpoint cannot add an unlocated hold beside seat-specific holds', async () => {
    const held = await request(app)
      .post('/api/showtimes/1/seat-holds')
      .set('Authorization', token(2))
      .send({ seatIds: [1] });
    expect(held.status).toBe(201);

    const legacy = await request(app)
      .post('/api/showtimes/1/holds')
      .set('Authorization', token(3))
      .send({ quantity: 1 });
    expect(legacy.status).toBe(409);
    expect(legacy.body.message).toMatch(/đang dùng giữ chỗ theo mã ghế/i);
  });

  test('S-10 AC4: a closed showtime rejects seat holds with HTTP 409', async () => {
    await mockDatabase('showtimes').where({ id: 1 }).update({ status: 'closed' });
    const response = await request(app)
      .post('/api/showtimes/1/seat-holds')
      .set('Authorization', token(2))
      .send({ seatIds: [1] });
    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/không còn mở bán/i);
  });

  test('S-10 NFR: concurrent buyers cannot hold the same seat twice', async () => {
    const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => request(app)
      .post('/api/showtimes/1/seat-holds')
      .set('Authorization', token(i + 2))
      .send({ seatIds: [1] })));
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(19);
    expect(await mockDatabase('seat_hold_seats').where({ showtime_id: 1, seat_id: 1 })).toHaveLength(1);
  });

  test('S-10: removing one held seat keeps the shared deadline; removing the last cancels the group', async () => {
    const held = await request(app)
      .post('/api/showtimes/1/seat-holds')
      .set('Authorization', token(2))
      .send({ seatIds: [1, 2] });
    const deadline = held.body.data.hold.expiresAt;
    const removedOne = await request(app)
      .delete(`/api/showtimes/1/seat-holds/${held.body.data.hold.id}/seats/1`)
      .set('Authorization', token(2));
    expect(removedOne.status).toBe(200);
    expect(removedOne.body.data.hold).toMatchObject({ seatIds: [2], quantity: 1, expiresAt: deadline });

    const removedLast = await request(app)
      .delete(`/api/showtimes/1/seat-holds/${held.body.data.hold.id}/seats/2`)
      .set('Authorization', token(2));
    expect(removedLast.status).toBe(200);
    expect(removedLast.body.data.hold).toBeNull();
    expect((await stored(held.body.data.hold.id)).status).toBe('cancelled');
  });

  test('S-10 T-22: per-seat migration rolls back and reapplies cleanly', async () => {
    const migration = require('../src/migrations/007_create_seat_hold_seats');
    await migration.down(mockDatabase);
    expect(await mockDatabase.schema.hasTable('seat_hold_seats')).toBe(false);
    await migration.up(mockDatabase);
    expect(await mockDatabase.schema.hasTable('seat_hold_seats')).toBe(true);
  });
});
