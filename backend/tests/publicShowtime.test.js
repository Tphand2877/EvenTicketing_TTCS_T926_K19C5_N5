process.env.JWT_SECRET = 'public-query-test-only';
const request = require('supertest');
jest.mock('../src/models/PublicShowtime', () => ({ listOnSale: jest.fn(), findPublic: jest.fn(), seatMap: jest.fn() }));
jest.mock('../src/services/showtimePageCache', () => ({ get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue() }));
const source = require('../src/models/PublicShowtime');
const cache = require('../src/services/showtimePageCache');
const { parsePage } = require('../src/services/publicShowtimeService');
const app = require('../src/app');
const row = (id) => ({
  id, event_id: 1, title: 'Concert', description: 'Public', venue: 'Theatre', category: 'Music', image_url: null,
  starts_at: '2099-01-01T00:00:00.000Z', ends_at: null, status: 'on_sale',
  cursor_time: `2099-01-01T00:00:00.00000${id}Z`, min_price: '10', max_price: '30',
  organizer_id: 123, notes: 'private', user_id: 7, on_sale: true,
});
beforeEach(() => { jest.clearAllMocks(); cache.get.mockResolvedValue(null); });
test('T-17 is public, uses a lookahead cursor, and returns an explicit public projection', async () => {
  source.listOnSale.mockResolvedValue([row(1), row(2), row(3)]);
  const res = await request(app).get('/api/showtimes?limit=2');
  expect(res.status).toBe(200);
  expect(res.body.data.showtimes).toHaveLength(2);
  expect(res.body.data.showtimes[0]).toMatchObject({ id: 1, min_price: 10, max_price: 30 });
  expect(res.body.data.showtimes[0]).not.toHaveProperty('organizer_id');
  expect(res.body.data.showtimes[0]).not.toHaveProperty('notes');
  expect(res.body.data.showtimes[0]).not.toHaveProperty('cursor_time');
  expect(parsePage({ limit: '2', cursor: res.body.data.pagination.next_cursor })).toEqual({
    limit: 2, after: { id: 2, startsAt: '2099-01-01T00:00:00.000002Z' },
  });
  expect(cache.set).toHaveBeenCalledTimes(1);
});
test('Empty/last pages have no next cursor; page keys differ by limit and cursor', async () => {
  source.listOnSale.mockResolvedValue([]);
  expect((await request(app).get('/api/showtimes')).body.data.pagination).toEqual({ limit: 20, has_more: false, next_cursor: null });
  await request(app).get('/api/showtimes?limit=1');
  const cursor = Buffer.from(JSON.stringify({ v: 1, id: 1, startsAt: row(1).cursor_time })).toString('base64url');
  await request(app).get('/api/showtimes').query({ cursor });
  expect(new Set(cache.get.mock.calls.map(([key]) => key)).size).toBe(3);
});
test('Cache hit avoids SQL entirely', async () => {
  const value = { showtimes: [], pagination: { limit: 20, has_more: false, next_cursor: null } };
  cache.get.mockResolvedValue(value);
  const res = await request(app).get('/api/showtimes');
  expect(res.body.data).toEqual(value);
  expect(source.listOnSale).not.toHaveBeenCalled();
});
test.each(['0', '51', '-1', '2x', '1.5', '1e2', ''])('Invalid limit %s fails before DB/cache', async (limit) => {
  expect((await request(app).get('/api/showtimes').query({ limit })).status).toBe(400);
  expect(source.listOnSale).not.toHaveBeenCalled();
  expect(cache.get).not.toHaveBeenCalled();
});
test.each(['', 'bad!', Buffer.from('null').toString('base64url'),
  Buffer.from(JSON.stringify({ v: 1, id: 1, startsAt: '2099-02-30T00:00:00.000000Z' })).toString('base64url'),
  Buffer.from(JSON.stringify({ v: 1, id: '1 OR 1=1', startsAt: row(1).cursor_time })).toString('base64url'),
])('Invalid cursor is rejected', async (cursor) => {
  expect((await request(app).get('/api/showtimes').query({ cursor })).status).toBe(400);
  expect(source.listOnSale).not.toHaveBeenCalled();
});
test('Repeated query parameters are rejected', async () => {
  expect((await request(app).get('/api/showtimes?limit=1&limit=2')).status).toBe(400);
});
test('Closed showtime detail gives a message; seat map is inaccessible', async () => {
  source.findPublic.mockResolvedValue({ ...row(1), status: 'closed', on_sale: false });
  source.seatMap.mockResolvedValue({ showtime_id: 1, on_sale: false, seats: [] });
  const detail = await request(app).get('/api/showtimes/1');
  expect(detail.status).toBe(200);
  expect(detail.body).toMatchObject({ message: 'Suất diễn không mở bán.', data: { on_sale: false } });
  expect((await request(app).get('/api/showtimes/1/seats')).status).toBe(409);
});
test('T-19 returns the map in one model call without login or per-seat queries', async () => {
  source.seatMap.mockResolvedValue({ showtime_id: 1, on_sale: true, seats: [{ id: 1, status: 'held' }] });
  expect((await request(app).get('/api/showtimes/1/seats')).body.data).toEqual({ showtime_id: 1, seats: [{ id: 1, status: 'held' }] });
  expect(source.seatMap).toHaveBeenCalledTimes(1);
  expect(source.findPublic).not.toHaveBeenCalled();
});
test('Missing/private showtimes and malformed IDs give 404', async () => {
  source.findPublic.mockResolvedValue(undefined);
  source.seatMap.mockResolvedValue(undefined);
  for (const url of ['/api/showtimes/1', '/api/showtimes/1/seats', '/api/showtimes/1.5', '/api/showtimes/2147483648/seats']) {
    expect((await request(app).get(url)).status).toBe(404);
  }
});
test.each(['42P01', '42703'])('Missing dependency schema %s returns 503 rather than fake availability', async (code) => {
  source.seatMap.mockRejectedValue(Object.assign(new Error('SQL with private user'), { code }));
  const res = await request(app).get('/api/showtimes/1/seats');
  expect(res.status).toBe(503);
  expect(res.text).not.toContain('private');
});
test('Unexpected SQL errors do not expose/log query data', async () => {
  source.listOnSale.mockRejectedValue(new Error('private SQL parameters'));
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const res = await request(app).get('/api/showtimes');
    expect(res.status).toBe(500);
    expect(res.text).not.toContain('private');
    expect(log).toHaveBeenCalledWith('[PublicShowtimes] Query failed.');
  } finally { log.mockRestore(); }
});
