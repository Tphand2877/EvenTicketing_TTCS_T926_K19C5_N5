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
  }, 30000);
  beforeEach(async () => {
    await mockDatabase('seat_holds').del();
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
    await service.convertToOrder({ holdId: pending.id, userId: 2, orderId: 'pending-1' });
    await expire(pending.id);
    const confirmed = await createHold(3, { showtimeId: 2 });
    await service.convertToOrder({ holdId: confirmed.id, userId: 3, orderId: 'confirmed-1' });
    await mockDatabase('seat_holds').where({ id: confirmed.id }).update({ status: 'confirmed' });
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
  test('Concurrent conversion retries record one order and reject a different order', async () => {
    const hold = await createHold();
    const args = { holdId: hold.id, userId: 2, orderId: 'same-order' };
    const retries = await Promise.all(Array.from({ length: 8 }, () => service.convertToOrder(args)));
    expect(retries.every((r) => r.id === hold.id)).toBe(true);
    await expect(service.convertToOrder({ ...args, orderId: 'other-order' })).rejects.toMatchObject({ code: 'HOLD_EXPIRED' });
    expect(await mockDatabase('seat_holds').where({ order_id: 'same-order' })).toHaveLength(1);
  });
  test('Conversion racing with cleanup of an expired hold cannot create an order', async () => {
    const hold = await createHold();
    await expire(hold.id);
    const results = await Promise.allSettled([
      service.convertToOrder({ holdId: hold.id, userId: 2, orderId: 'too-late' }), service.cleanupExpired(),
    ]);
    expect(results[0].status).toBe('rejected');
    expect((await stored(hold.id)).status).toBe('cancelled');
    expect((await stored(hold.id)).order_id).toBeNull();
  });
  test('Conversion before expiry remains protected when cleanup runs concurrently', async () => {
    const hold = await createHold();
    await Promise.all([
      service.convertToOrder({ holdId: hold.id, userId: 2, orderId: 'before-expiry' }), service.cleanupExpired(),
    ]);
    await expire(hold.id);
    expect(await service.cleanupExpired()).toBe(0);
    expect((await stored(hold.id)).status).toBe('pending_payment');
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
    const migration = require('../src/migrations/006_create_seat_holds');
    await migration.down(mockDatabase);
    expect(await mockDatabase.schema.hasTable('seat_holds')).toBe(false);
    await migration.up(mockDatabase);
    expect(await mockDatabase.schema.hasTable('seat_holds')).toBe(true);
  });
});
