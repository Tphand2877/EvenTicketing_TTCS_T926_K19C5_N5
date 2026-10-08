/** T-15 sale status, S-15 prices and future per-seat holds/tickets are test fixtures; T-11 tables use the real migration. */
process.env.JWT_SECRET = 'public-query-integration-test-only';
const crypto = require('crypto');
const path = require('path');
const knex = require('knex');
const request = require('supertest');
const { performance } = require('perf_hooks');
const config = require('../knexfile').test;
const schema = `public_query_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const mockDatabase = knex({ ...config, searchPath: [schema], pool: { min: 0, max: 8 } });
jest.mock('../src/config/database', () => mockDatabase);
const app = require('../src/app');
const repository = require('../src/models/PublicShowtime');
const { createPublicShowtimeService } = require('../src/services/publicShowtimeService');
const { createShowtimePageCache } = require('../src/services/showtimePageCache');
const uncached = createPublicShowtimeService({ pageCache: { get: async () => null, set: async () => {} } });
const describeDatabase = process.env.RUN_PUBLIC_QUERY_DB_TESTS === '1' ? describe : describe.skip;
const describeRedis = process.env.RUN_PUBLIC_QUERY_REDIS_TESTS === '1' ? describe : describe.skip;
const p95 = (samples) => samples.sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1];

describeDatabase('Minh Quang T-17/T-19: real PostgreSQL query contract', () => {
  beforeAll(async () => {
    await mockDatabase.schema.createSchema(schema);
    await mockDatabase.migrate.latest({ directory: path.join(__dirname, '../src/migrations') });
    await mockDatabase.raw(`
      CREATE TYPE sale_status AS ENUM ('draft', 'on_sale', 'closed');
      ALTER TABLE showtimes ADD COLUMN status sale_status NOT NULL DEFAULT 'draft';
      -- seats/seat_categories now come from the real T-11 migration (007).
      -- Only the later S-15 price column (and an internal field that must never leak) are simulated.
      ALTER TABLE seat_categories ADD COLUMN price integer, ADD COLUMN notes text;
      CREATE TABLE fixture_holds (
        id serial PRIMARY KEY, showtime_id integer NOT NULL, seat_id integer NOT NULL,
        status text NOT NULL, expires_at timestamptz NOT NULL, user_id integer);
      CREATE INDEX holds_showtime_seat ON fixture_holds(showtime_id, seat_id);
      CREATE TABLE fixture_tickets (
        id serial PRIMARY KEY, showtime_id integer NOT NULL, seat_id integer NOT NULL, status text NOT NULL);
      CREATE INDEX tickets_showtime_seat ON fixture_tickets(showtime_id, seat_id);
      CREATE VIEW public_seat_holds AS SELECT showtime_id, seat_id, status, expires_at FROM fixture_holds;
      CREATE VIEW public_sold_seats AS SELECT showtime_id, seat_id FROM fixture_tickets WHERE status = 'confirmed';
      CREATE INDEX showtime_sale_start ON showtimes(status, starts_at, id);
    `);
    await mockDatabase('roles').insert({ id: 1, name: 'organizer' });
    await mockDatabase('users').insert({ id: 1, email: 'query-fixture@example.test', password_hash: 'fixture', role_id: 1 });
    await mockDatabase('events').insert([
      { id: 1, organizer_id: 1, title: 'Public concert', venue: 'Test', status: 'published' },
      { id: 2, organizer_id: 1, title: 'Private draft', venue: 'Test', status: 'draft' },
    ]);
    await mockDatabase('showtimes').insert(Array.from({ length: 200 }, (_, i) => ({
      id: i + 1, event_id: 1, starts_at: '2099-01-01T00:00:00Z', capacity: 2000,
      price: 999999, status: 'on_sale',
    })));
    await mockDatabase('seat_categories').insert(Array.from({ length: 400 }, (_, i) => ({
      id: i + 1, showtime_id: Math.floor(i / 2) + 1, name: i % 2 ? 'VIP' : 'Standard',
      price: i % 2 ? 300000 : 100000, notes: 'Internal note',
    })));
    await mockDatabase('seats').insert(Array.from({ length: 2000 }, (_, i) => ({
      id: i + 1, showtime_id: 1, row_label: `R${String(Math.floor(i / 20)).padStart(3, '0')}`,
      seat_number: i % 20 + 1, category_id: i % 2 + 1,
    })));
    await mockDatabase.raw('ANALYZE');
  }, 30000);
  beforeEach(async () => {
    await mockDatabase('fixture_holds').del();
    await mockDatabase('fixture_tickets').del();
    await mockDatabase('showtimes').update({ status: 'on_sale', starts_at: '2099-01-01T00:00:00Z', event_id: 1 });
  });
  afterAll(async () => {
    await require('../src/services/showtimePageCache').close();
    await mockDatabase.schema.dropSchemaIfExists(schema, true);
    await mockDatabase.destroy();
  });
  test('All 200 showtimes paginate with equal timestamps, without duplicate/missing IDs', async () => {
    let cursor;
    const ids = [];
    do {
      const page = await uncached.list({ limit: '17', ...(cursor ? { cursor } : {}) });
      ids.push(...page.showtimes.map((s) => s.id));
      cursor = page.pagination.next_cursor;
    } while (cursor);
    expect(ids).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
  });
  test('Cursor retains PostgreSQL microseconds instead of truncating to JS milliseconds', async () => {
    await mockDatabase('showtimes').whereIn('id', [1, 2, 3]).update({ starts_at: '2098-01-01T00:00:00.000001Z' });
    await mockDatabase('showtimes').where({ id: 2 }).update({ starts_at: '2098-01-01T00:00:00.000002Z' });
    const first = await uncached.list({ limit: '2' });
    expect(first.showtimes.map((s) => s.id)).toEqual([1, 3]);
    const second = await uncached.list({ limit: '1', cursor: first.pagination.next_cursor });
    expect(second.showtimes[0].id).toBe(2);
  });
  test('Only future on-sale showtimes of public events are listed; prices come from categories', async () => {
    await mockDatabase('showtimes').where({ id: 1 }).update({ status: 'draft' });
    await mockDatabase('showtimes').where({ id: 2 }).update({ status: 'closed' });
    await mockDatabase('showtimes').where({ id: 3 }).update({ event_id: 2 });
    await mockDatabase('showtimes').where({ id: 4 }).update({ starts_at: '2000-01-01T00:00:00Z' });
    const page = await uncached.list({ limit: '50' });
    expect(page.showtimes[0]).toMatchObject({ id: 5, min_price: 100000, max_price: 300000 });
    expect(page.showtimes.some((s) => s.id < 5)).toBe(false);
    expect(JSON.stringify(page)).not.toMatch(/organizer_id|password_hash|notes|user_id/);
    expect((await request(app).get('/api/showtimes/2')).body.data.on_sale).toBe(false);
    expect((await request(app).get('/api/showtimes/3')).status).toBe(404);
  });
  test('T-19 merges live holds, sold tickets, duplicate rows, expired/cancelled holds and payment allocations', async () => {
    await mockDatabase('fixture_holds').insert([
      { showtime_id: 1, seat_id: 1, status: 'active', expires_at: '2099-01-01', user_id: 123 },
      { showtime_id: 1, seat_id: 1, status: 'active', expires_at: '2099-01-01', user_id: 124 },
      { showtime_id: 1, seat_id: 2, status: 'active', expires_at: new Date(0) },
      { showtime_id: 1, seat_id: 3, status: 'cancelled', expires_at: '2099-01-01' },
      { showtime_id: 1, seat_id: 4, status: 'active', expires_at: '2099-01-01' },
      { showtime_id: 1, seat_id: 5, status: 'pending_payment', expires_at: new Date(0) },
      { showtime_id: 1, seat_id: 6, status: 'confirmed', expires_at: new Date(0) },
      { showtime_id: 2, seat_id: 7, status: 'active', expires_at: '2099-01-01' },
      { showtime_id: 1, seat_id: 8, status: 'active', expires_at: mockDatabase.raw('statement_timestamp()') },
    ]);
    await mockDatabase('fixture_tickets').insert([
      { showtime_id: 1, seat_id: 4, status: 'confirmed' },
      { showtime_id: 1, seat_id: 4, status: 'confirmed' },
      { showtime_id: 1, seat_id: 9, status: 'cancelled' },
      { showtime_id: 2, seat_id: 10, status: 'confirmed' },
    ]);
    const queries = [];
    const listener = (q) => queries.push(q.sql);
    mockDatabase.on('query', listener);
    let response;
    try { response = await request(app).get('/api/showtimes/1/seats'); }
    finally { mockDatabase.removeListener('query', listener); }
    expect(response.status).toBe(200);
    expect(queries).toHaveLength(1);
    const seats = response.body.data.seats;
    expect(seats).toHaveLength(2000);
    expect(seats.slice(0, 10).map((s) => s.status)).toEqual([
      'held', 'available', 'available', 'sold', 'held', 'sold', 'available', 'available', 'available', 'available',
    ]);
    expect(new Set(seats.map((s) => s.status))).toEqual(new Set(['available', 'held', 'sold']));
    expect(JSON.stringify(response.body)).not.toMatch(/user_id|expires_at|notes|order_id/);
    expect(seats[0]).toMatchObject({ row: 'R000', number: 1, category: 'Standard', price: 100000 });
  });
  test('Closed/draft/past showtimes do not expose a map; missing/private IDs give 404', async () => {
    for (const update of [{ status: 'closed' }, { status: 'draft' }, { status: 'on_sale', starts_at: '2000-01-01' }]) {
      await mockDatabase('showtimes').where({ id: 1 }).update(update);
      expect((await request(app).get('/api/showtimes/1/seats')).status).toBe(409);
    }
    await mockDatabase('showtimes').where({ id: 1 }).update({ event_id: 2 });
    expect((await request(app).get('/api/showtimes/1/seats')).status).toBe(404);
    expect((await request(app).get('/api/showtimes/9999/seats')).status).toBe(404);
  });
  test('Absent allocation adapter fails closed with 503', async () => {
    await mockDatabase.raw('ALTER VIEW public_seat_holds RENAME TO disabled_seat_holds');
    try { expect((await request(app).get('/api/showtimes/1/seats')).status).toBe(503); }
    finally { await mockDatabase.raw('ALTER VIEW disabled_seat_holds RENAME TO public_seat_holds'); }
  });
  test('T-11 categories without the later S-15 price column have null prices, not invented amounts', async () => {
    await mockDatabase.raw('ALTER TABLE seat_categories RENAME COLUMN price TO future_price');
    try {
      expect((await uncached.list({ limit: '1' })).showtimes[0]).toMatchObject({ min_price: null, max_price: null });
      expect((await repository.seatMap(1)).seats[0].price).toBeNull();
    } finally { await mockDatabase.raw('ALTER TABLE seat_categories RENAME COLUMN future_price TO price'); }
  });
  test('p95 budget: 200 showtimes <500ms and 2000 seats <200ms (40 samples including HTTP/JSON)', async () => {
    await mockDatabase('fixture_holds').insert(Array.from({ length: 2000 }, (_, i) => ({
      showtime_id: 1, seat_id: i + 1, status: i % 2 ? 'active' : 'cancelled', expires_at: '2099-01-01',
    })));
    await mockDatabase('fixture_tickets').insert(Array.from({ length: 500 }, (_, i) => ({
      showtime_id: 1, seat_id: i * 4 + 1, status: 'confirmed',
    })));
    const listTimes = [];
    const uncachedTimes = [];
    const mapTimes = [];
    for (let i = 0; i < 40; i += 1) {
      let start = performance.now();
      await uncached.list({ limit: '50' });
      uncachedTimes.push(performance.now() - start);
      start = performance.now();
      const list = await request(app).get('/api/showtimes?limit=50');
      listTimes.push(performance.now() - start);
      expect(list.status).toBe(200);
      start = performance.now();
      const map = await request(app).get('/api/showtimes/1/seats');
      mapTimes.push(performance.now() - start);
      expect(map.body.data.seats).toHaveLength(2000);
    }
    const listP95 = p95(listTimes);
    const mapP95 = p95(mapTimes);
    const uncachedP95 = p95(uncachedTimes);
    console.log(`Public query benchmark: 200 showtimes HTTP p95=${listP95.toFixed(2)}ms; uncached p95=${uncachedP95.toFixed(2)}ms; 2000 seats HTTP p95=${mapP95.toFixed(2)}ms; samples=40`);
    expect(listP95).toBeLessThan(500);
    expect(uncachedP95).toBeLessThan(500);
    expect(mapP95).toBeLessThan(200);
  }, 30000);

  describeRedis('Real Redis page cache', () => {
    test('30-second TTL, cache hit avoids SQL, next page is separate, expiry reloads SQL', async () => {
      const { createClient } = require('@redis/client');
      const client = createClient({ url: process.env.REDIS_URL });
      client.on('error', () => {});
      const cache = createShowtimePageCache({ url: process.env.REDIS_URL });
      const source = { listOnSale: jest.fn((args) => repository.listOnSale(args)) };
      const prefix = `test:${crypto.randomUUID()}:`;
      const keys = [];
      const testCache = {
        get: (k) => { if (!keys.includes(prefix + k)) keys.push(prefix + k); return cache.get(prefix + k); },
        set: (k, v) => cache.set(prefix + k, v),
      };
      const isolated = createPublicShowtimeService({ source, pageCache: testCache });
      try {
        await client.connect();
        const first = await isolated.list({ limit: '20' });
        expect(await client.ttl(keys[0])).toBeGreaterThanOrEqual(29);
        expect(await client.ttl(keys[0])).toBeLessThanOrEqual(30);
        expect(await isolated.list({ limit: '20' })).toEqual(first);
        expect(source.listOnSale).toHaveBeenCalledTimes(1);
        const second = await isolated.list({ limit: '20', cursor: first.pagination.next_cursor });
        expect(second.showtimes[0].id).toBe(21);
        expect(keys).toHaveLength(2);
        await client.pExpire(keys[0], 1);
        await new Promise((resolve) => setTimeout(resolve, 10));
        await isolated.list({ limit: '20' });
        expect(source.listOnSale).toHaveBeenCalledTimes(3);
      } finally {
        if (client.isReady && keys.length) await client.del(keys);
        if (client.isOpen) client.destroy();
        await cache.close();
      }
    });
  });
});
