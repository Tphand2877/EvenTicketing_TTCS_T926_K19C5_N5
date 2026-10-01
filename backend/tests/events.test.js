/**
 * SCRUM-80 - Events & Showtimes API
 * SCRUM-84 (spike) - Seat hold API
 *
 * Model được mock bằng dữ liệu in-memory để không cần DB thật.
 */

process.env.JWT_SECRET = 'test_secret_key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockEvents = [];
const mockShowtimes = [];

jest.mock('../src/models/AuditLog', () => ({
  create: jest.fn().mockResolvedValue(1),
}));

jest.mock('../src/models/Event', () => {
  const withStats = (e) => {
    const shows = mockShowtimes.filter((s) => s.event_id === e.id);
    return {
      ...e,
      organizer_name: 'Organizer',
      min_price: shows.length ? Math.min(...shows.map((s) => s.price)) : null,
      showtime_count: shows.length,
    };
  };
  return {
    listPublished: jest.fn(async ({ search, category, limit, offset }) => {
      const rows = mockEvents
        .filter((e) => e.status === 'published')
        .filter((e) => !search || e.title.toLowerCase().includes(search.toLowerCase()))
        .filter((e) => !category || e.category === category);
      return { rows: rows.slice(offset, offset + limit).map(withStats), total: rows.length };
    }),
    listByOrganizer: jest.fn(async (organizerId) =>
      mockEvents.filter((e) => e.organizer_id === organizerId).map(withStats)),
    listAll: jest.fn(async () => mockEvents.map(withStats)),
    findById: jest.fn(async (id) => {
      const e = mockEvents.find((x) => x.id === id);
      return e ? withStats(e) : undefined;
    }),
    create: jest.fn(async (data) => {
      const e = { id: mockEvents.length + 1, status: 'published', category: 'Khac', ...data };
      mockEvents.push(e);
      return [e];
    }),
    updateById: jest.fn(async (id, data) => {
      const e = mockEvents.find((x) => x.id === id);
      Object.assign(e, data);
      return [e];
    }),
    deleteById: jest.fn(async (id) => {
      const i = mockEvents.findIndex((x) => x.id === id);
      mockEvents.splice(i, 1);
      return 1;
    }),
  };
});

jest.mock('../src/models/Showtime', () => ({
  listByEvent: jest.fn(async (eventId) => mockShowtimes.filter((s) => s.event_id === eventId)),
  findById: jest.fn(async (id) => mockShowtimes.find((s) => s.id === id)),
  create: jest.fn(async (data) => {
    const s = { id: mockShowtimes.length + 1, ends_at: null, ...data };
    mockShowtimes.push(s);
    return [s];
  }),
  updateById: jest.fn(async (id, data) => {
    const s = mockShowtimes.find((x) => x.id === id);
    Object.assign(s, data);
    return [s];
  }),
  deleteById: jest.fn(async () => 1),
}));

const app = require('../src/app');
const seatHoldService = require('../src/services/seatHoldService');

const tokenFor = (userId, role) => `Bearer ${jwt.sign({ userId, role, email: `u${userId}@test.com` }, process.env.JWT_SECRET)}`;
const ORGANIZER = tokenFor(1, 'organizer');
const OTHER_ORGANIZER = tokenFor(2, 'organizer');
const ADMIN = tokenFor(3, 'admin');
const BUYER = tokenFor(4, 'buyer');
const OTHER_BUYER = tokenFor(5, 'buyer');

const FUTURE = '2099-01-01T12:00:00.000Z';

const validEvent = { title: 'Hòa nhạc Mùa Thu', venue: 'Nhà hát Lớn', category: 'Âm nhạc' };

beforeEach(() => {
  mockEvents.length = 0;
  mockShowtimes.length = 0;
  seatHoldService._reset();
});

const createEventWithShowtime = async ({ capacity = 3, startsAt = FUTURE } = {}) => {
  const ev = await request(app).post('/api/events').set('Authorization', ORGANIZER).send(validEvent);
  const st = await request(app)
    .post(`/api/events/${ev.body.data.event.id}/showtimes`)
    .set('Authorization', ORGANIZER)
    .send({ starts_at: startsAt, price: 350000, capacity });
  return { event: ev.body.data.event, showtime: st.body.data.showtime };
};

describe('SCRUM-80: Organizer quản lý sự kiện', () => {
  test('Organizer tạo event thành công; organizer_id lấy từ token, không lấy từ body', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', ORGANIZER)
      .send({ ...validEvent, organizer_id: 999 });

    expect(res.status).toBe(201);
    expect(res.body.data.event.organizer_id).toBe(1);
    expect(res.body.data.event.title).toBe(validEvent.title);
  });

  test('Thiếu tên / địa điểm → 400', async () => {
    const res = await request(app).post('/api/events').set('Authorization', ORGANIZER).send({ category: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(2);
  });

  test('Buyer không được tạo event → 403', async () => {
    const res = await request(app).post('/api/events').set('Authorization', BUYER).send(validEvent);
    expect(res.status).toBe(403);
  });

  test('Chưa đăng nhập không được tạo event → 401', async () => {
    const res = await request(app).post('/api/events').send(validEvent);
    expect(res.status).toBe(401);
  });

  test('Organizer khác không được sửa / xóa event không phải của mình → 403', async () => {
    const { event } = await createEventWithShowtime();

    const patch = await request(app)
      .patch(`/api/events/${event.id}`).set('Authorization', OTHER_ORGANIZER).send({ title: 'Hack' });
    const del = await request(app).delete(`/api/events/${event.id}`).set('Authorization', OTHER_ORGANIZER);

    expect(patch.status).toBe(403);
    expect(del.status).toBe(403);
  });

  test('Admin được sửa event của organizer khác', async () => {
    const { event } = await createEventWithShowtime();
    const res = await request(app)
      .patch(`/api/events/${event.id}`).set('Authorization', ADMIN).send({ title: 'Đổi tên' });

    expect(res.status).toBe(200);
    expect(res.body.data.event.title).toBe('Đổi tên');
  });

  test('Chủ event xóa được event', async () => {
    const { event } = await createEventWithShowtime();
    const res = await request(app).delete(`/api/events/${event.id}`).set('Authorization', ORGANIZER);
    expect(res.status).toBe(200);
  });

  test('GET /api/events/mine chỉ trả về event của organizer đang đăng nhập', async () => {
    await createEventWithShowtime();
    await request(app).post('/api/events').set('Authorization', OTHER_ORGANIZER).send({ ...validEvent, title: 'Khác' });

    const res = await request(app).get('/api/events/mine').set('Authorization', ORGANIZER);
    expect(res.status).toBe(200);
    expect(res.body.data.events).toHaveLength(1);
    expect(res.body.data.events[0].organizer_id).toBe(1);
  });
});

describe('SCRUM-80: Suất diễn', () => {
  test('Tạo suất diễn hợp lệ', async () => {
    const { showtime } = await createEventWithShowtime();
    expect(showtime).toMatchObject({ price: 350000, capacity: 3 });
  });

  test('Giá âm / sức chứa 0 / kết thúc trước bắt đầu → 400', async () => {
    const { event } = await createEventWithShowtime();
    const res = await request(app)
      .post(`/api/events/${event.id}/showtimes`)
      .set('Authorization', ORGANIZER)
      .send({ starts_at: FUTURE, ends_at: '2098-01-01T00:00:00Z', price: -1, capacity: 0 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(3);
  });

  test('Organizer khác không được thêm / sửa suất diễn → 403', async () => {
    const { event, showtime } = await createEventWithShowtime();

    const add = await request(app)
      .post(`/api/events/${event.id}/showtimes`)
      .set('Authorization', OTHER_ORGANIZER)
      .send({ starts_at: FUTURE, price: 1, capacity: 1 });
    const patch = await request(app)
      .patch(`/api/showtimes/${showtime.id}`).set('Authorization', OTHER_ORGANIZER).send({ price: 1 });

    expect(add.status).toBe(403);
    expect(patch.status).toBe(403);
  });

  test('Sửa ends_at trước starts_at hiện có → 400', async () => {
    const { showtime } = await createEventWithShowtime();
    const res = await request(app)
      .patch(`/api/showtimes/${showtime.id}`).set('Authorization', ORGANIZER).send({ ends_at: '2000-01-01T00:00:00Z' });
    expect(res.status).toBe(400);
  });
});

describe('SCRUM-80: Buyer xem sự kiện (public)', () => {
  test('Danh sách chỉ gồm event đã publish, có phân trang', async () => {
    await createEventWithShowtime();
    await request(app).post('/api/events').set('Authorization', ORGANIZER).send({ ...validEvent, title: 'Nháp', status: 'draft' });

    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body.data.events).toHaveLength(1);
    expect(res.body.data.events[0].min_price).toBe(350000);
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 12, total: 1, totalPages: 1 });
  });

  test('Tìm kiếm theo tên và lọc theo danh mục', async () => {
    await createEventWithShowtime();
    await request(app).post('/api/events').set('Authorization', ORGANIZER)
      .send({ title: 'Tech Summit', venue: 'GEM', category: 'Công nghệ' });

    const byName = await request(app).get('/api/events').query({ q: 'tech' });
    const byCategory = await request(app).get('/api/events').query({ category: 'Âm nhạc' });

    expect(byName.body.data.events.map((e) => e.title)).toEqual(['Tech Summit']);
    expect(byCategory.body.data.events.map((e) => e.title)).toEqual([validEvent.title]);
  });

  test('limit bị giới hạn tối đa 50', async () => {
    const res = await request(app).get('/api/events').query({ limit: 1000 });
    expect(res.body.data.pagination.limit).toBe(50);
  });

  test('Chi tiết event kèm danh sách suất diễn', async () => {
    const { event } = await createEventWithShowtime();
    const res = await request(app).get(`/api/events/${event.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.event.title).toBe(validEvent.title);
    expect(res.body.data.showtimes).toHaveLength(1);
  });

  test('Event draft hoặc id không tồn tại / không hợp lệ → 404', async () => {
    const draft = await request(app).post('/api/events').set('Authorization', ORGANIZER)
      .send({ ...validEvent, status: 'draft' });

    expect((await request(app).get(`/api/events/${draft.body.data.event.id}`)).status).toBe(404);
    expect((await request(app).get('/api/events/9999')).status).toBe(404);
    expect((await request(app).get('/api/events/abc')).status).toBe(404);
  });
});

describe('SCRUM-84: Giữ chỗ có thời hạn', () => {
  test('Buyer giữ chỗ thành công, số chỗ trống giảm tương ứng', async () => {
    const { showtime } = await createEventWithShowtime({ capacity: 3 });

    const hold = await request(app)
      .post(`/api/showtimes/${showtime.id}/holds`).set('Authorization', BUYER).send({ quantity: 2 });
    expect(hold.status).toBe(201);
    expect(hold.body.data.hold.quantity).toBe(2);
    expect(new Date(hold.body.data.hold.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const availability = await request(app).get(`/api/showtimes/${showtime.id}/availability`);
    expect(availability.body.data).toEqual({ capacity: 3, held: 2, available: 1 });
  });

  test('Không đủ chỗ → 409 kèm số chỗ còn lại', async () => {
    const { showtime } = await createEventWithShowtime({ capacity: 3 });
    await request(app).post(`/api/showtimes/${showtime.id}/holds`).set('Authorization', BUYER).send({ quantity: 2 });

    const res = await request(app)
      .post(`/api/showtimes/${showtime.id}/holds`).set('Authorization', OTHER_BUYER).send({ quantity: 2 });
    expect(res.status).toBe(409);
    expect(res.body.data.available).toBe(1);
  });

  test('Chưa đăng nhập không được giữ chỗ → 401', async () => {
    const { showtime } = await createEventWithShowtime();
    const res = await request(app).post(`/api/showtimes/${showtime.id}/holds`).send({ quantity: 1 });
    expect(res.status).toBe(401);
  });

  test('Số lượng không hợp lệ → 400', async () => {
    const { showtime } = await createEventWithShowtime();
    const res = await request(app)
      .post(`/api/showtimes/${showtime.id}/holds`).set('Authorization', BUYER).send({ quantity: 11 });
    expect(res.status).toBe(400);
  });

  test('Suất diễn đã bắt đầu → 400', async () => {
    const { showtime } = await createEventWithShowtime({ startsAt: '2000-01-01T00:00:00Z' });
    const res = await request(app)
      .post(`/api/showtimes/${showtime.id}/holds`).set('Authorization', BUYER).send({ quantity: 1 });
    expect(res.status).toBe(400);
  });

  test('Chỉ chủ hold được hủy; hủy xong chỗ được trả lại', async () => {
    const { showtime } = await createEventWithShowtime({ capacity: 3 });
    const hold = await request(app)
      .post(`/api/showtimes/${showtime.id}/holds`).set('Authorization', BUYER).send({ quantity: 3 });
    const holdId = hold.body.data.hold.id;

    const byOther = await request(app).delete(`/api/showtimes/holds/${holdId}`).set('Authorization', OTHER_BUYER);
    const byOwner = await request(app).delete(`/api/showtimes/holds/${holdId}`).set('Authorization', BUYER);
    const again = await request(app).delete(`/api/showtimes/holds/${holdId}`).set('Authorization', BUYER);

    expect(byOther.status).toBe(403);
    expect(byOwner.status).toBe(200);
    expect(again.status).toBe(404);

    const availability = await request(app).get(`/api/showtimes/${showtime.id}/availability`);
    expect(availability.body.data.available).toBe(3);
  });
});
