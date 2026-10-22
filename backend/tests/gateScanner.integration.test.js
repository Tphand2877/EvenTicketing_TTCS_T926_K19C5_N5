/**
 * S-29 / S-30 (+ S-31 nối thật): nhân viên chọn suất + cổng, quét QR có chữ ký của vé thật.
 * PostgreSQL thật, migrations thật, vé thật (bảng tickets S-25), QR ký thật (S-26),
 * sổ lượt vào thật của S-31 (ticket_checkins), vai trò thật (S-28).
 */
process.env.JWT_SECRET = 's30-auth-test-only';
process.env.TICKET_QR_SECRET = 's30-ticket-qr-secret-for-tests-only-0001';

const crypto = require('crypto');
const path = require('path');
const jwt = require('jsonwebtoken');
const knex = require('knex');
const request = require('supertest');
const config = require('../knexfile').test;
const { signTicketCode } = require('../src/utils/ticketQr');

const schema = `s30_test_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const mockDatabase = knex({
  ...config,
  connection: { ...config.connection, database: process.env.DB_NAME_TEST || config.connection.database },
  searchPath: [schema],
  pool: { min: 0, max: 12 },
});
jest.mock('../src/config/database', () => mockDatabase);
const app = require('../src/app');
const database = mockDatabase;
const describeDatabase = process.env.RUN_GATE_SCAN_DB_TESTS === '1' ? describe : describe.skip;

const USERS = { organizer: 1, buyer: 2, staff: 3, supervisor: 4, otherOrganizer: 5, lockedStaff: 6 };
const ROLE_OF = { 1: 'organizer', 2: 'buyer', 3: 'staff', 4: 'supervisor', 5: 'organizer', 6: 'staff' };
const NAME_OF = { 3: 'Lê Văn Cổng', 4: 'Trần Trưởng Ca', 6: 'Nhân viên đã nghỉ' };
const as = (userId) => `Bearer ${jwt.sign({ userId, role: ROLE_OF[userId], email: `u${userId}@s30.test` }, process.env.JWT_SECRET)}`;
const scan = (userId, body) => request(app).post('/api/scanner/scan').set('Authorization', as(userId)).send(body);
const note = (userId, body) => request(app).post('/api/scanner/admit-with-note').set('Authorization', as(userId)).send(body);
const result = (res) => res.body.data?.result;

let seatSeq = 0;
/** Vé thật của một đơn đã thanh toán ở suất showtimeId. Trả mã vé. */
const issueTicket = async (showtimeId, status = 'valid') => {
  seatSeq += 1;
  const [seat] = await database('seats').insert({ showtime_id: showtimeId, category_id: showtimeId, row_label: 'C', seat_number: seatSeq }).returning('id');
  const orderId = crypto.randomUUID();
  await database('orders').insert({ id: orderId, user_id: USERS.buyer, status: 'paid', total_amount: 100000, currency: 'VND', expires_at: '2099-01-01' });
  const [item] = await database('order_items').insert({ order_id: orderId, seat_id: seat.id, category_name: 'VIP', unit_price: 100000 }).returning('id');
  const id = crypto.randomUUID();
  await database('tickets').insert({ id, order_id: orderId, order_item_id: item.id, seat_id: seat.id, showtime_id: showtimeId, user_id: USERS.buyer, status });
  return id;
};

describeDatabase('S-29 / S-30: chọn suất + cổng rồi quét QR vé tại cổng', () => {
  beforeAll(async () => {
    await database.schema.createSchema(schema);
    await database.migrate.latest({ directory: path.join(__dirname, '../src/migrations') });
    for (const name of ['admin', 'organizer', 'buyer', 'staff', 'supervisor']) await database('roles').insert({ name });
    const roleId = async (name) => (await database('roles').where({ name }).first()).id;
    for (const [id, role] of Object.entries(ROLE_OF)) {
      await database('users').insert({ id: Number(id), email: `u${id}@s30.test`, password_hash: 'x', role_id: await roleId(role),
        full_name: NAME_OF[id] || null, is_active: Number(id) !== USERS.lockedStaff });
    }
    await database('events').insert([
      { id: 1, organizer_id: USERS.organizer, title: 'Đêm nhạc S-30', venue: 'Nhà hát', status: 'published' },
      { id: 2, organizer_id: USERS.otherOrganizer, title: 'Sự kiện khác', venue: 'Sân vận động', status: 'published' },
    ]);
    await database('showtimes').insert([
      { id: 1, event_id: 1, starts_at: '2099-01-01T12:00:00Z', capacity: 100, status: 'on_sale' },
      { id: 2, event_id: 1, starts_at: '2099-01-02T12:00:00Z', capacity: 100, status: 'on_sale' },
      { id: 3, event_id: 1, starts_at: '2099-01-03T12:00:00Z', capacity: 100, status: 'draft' },
      { id: 4, event_id: 2, starts_at: '2099-01-04T12:00:00Z', capacity: 100, status: 'closed' },
    ]);
    await database('seat_categories').insert([1, 2, 3, 4].map((id) => ({ id, showtime_id: id, name: 'VIP' })));
  }, 30000);

  afterAll(async () => {
    await require('../src/services/showtimePageCache').close();
    await database.schema.dropSchemaIfExists(schema, true);
    await database.destroy();
  });

  test('S-29: organizer khai báo cổng cho sự kiện của mình; organizer khác, nhân viên, người mua không sửa được', async () => {
    const res = await request(app).put('/api/events/1/gates').set('Authorization', as(USERS.organizer)).send({ gates: [' Cổng A ', 'Cổng B'] });
    expect(res.status).toBe(200);
    expect(res.body.data.gates).toEqual(['Cổng A', 'Cổng B']);
    for (const userId of [USERS.otherOrganizer, USERS.staff, USERS.buyer]) {
      expect((await request(app).put('/api/events/1/gates').set('Authorization', as(userId)).send({ gates: ['X'] })).status).toBe(403);
    }
    expect((await request(app).put('/api/events/1/gates').set('Authorization', as(USERS.organizer)).send({ gates: ['A', 'a'] })).status).toBe(400);
    expect((await request(app).put('/api/events/1/gates').set('Authorization', as(USERS.organizer)).send({ gates: [] })).status).toBe(400);
    expect((await request(app).get('/api/events/1/gates').set('Authorization', as(USERS.organizer))).body.data.gates).toEqual(['Cổng A', 'Cổng B']);
  });

  test('S-29: nhân viên thấy danh sách suất (không có suất nháp) kèm cổng; sự kiện chưa khai báo cổng có "Cổng chính"', async () => {
    const res = await request(app).get('/api/scanner/showtimes').set('Authorization', as(USERS.staff));
    expect(res.status).toBe(200);
    const list = res.body.data.showtimes;
    expect(list.map((s) => s.id)).toEqual([1, 2, 4]);
    expect(list[0]).toMatchObject({ event: { title: 'Đêm nhạc S-30' }, gates: ['Cổng A', 'Cổng B'] });
    expect(list[2].gates).toEqual(['Cổng chính']);
    expect((await request(app).get('/api/scanner/showtimes').set('Authorization', as(USERS.buyer))).status).toBe(403);
  });

  test('S-29: chưa chọn suất hoặc cổng thì không quét được; cổng lạ / suất nháp bị từ chối', async () => {
    const qrCode = signTicketCode(await issueTicket(1));
    const cases = [
      [{ qrCode, gate: 'Cổng A' }, 'SHOWTIME_REQUIRED'],
      [{ qrCode, showtimeId: 1 }, 'GATE_REQUIRED'],
      [{ qrCode, showtimeId: 1, gate: 'Cổng Z' }, 'GATE_INVALID'],
      [{ qrCode, showtimeId: 3, gate: 'Cổng A' }, 'SHOWTIME_INVALID'],
      [{ qrCode, showtimeId: 4, gate: 'Cổng A' }, 'GATE_INVALID'], // cổng của sự kiện khác
    ];
    for (const [body, code] of cases) {
      const res = await scan(USERS.staff, body);
      expect([res.status, res.body.code]).toEqual([400, code]);
    }
    expect(await database('ticket_checkins')).toHaveLength(0);
  });

  test('S-30 AC: quét QR vé hợp lệ đúng suất -> cho vào, ghi cổng, thời điểm và nhân viên', async () => {
    const ticketId = await issueTicket(1);
    const res = await scan(USERS.staff, { qrCode: signTicketCode(ticketId), showtimeId: 1, gate: 'Cổng A' });

    expect(res.status).toBe(200);
    expect(result(res)).toMatchObject({
      accepted: true, code: 'CHECKED_IN', message: 'Vé hợp lệ. Mời vào.',
      ticket: { id: ticketId, category: 'VIP', event: { title: 'Đêm nhạc S-30' }, showtime: { id: 1 } },
      admission: { gate: 'Cổng A', staffName: 'Lê Văn Cổng' },
    });
    expect(result(res).ticket.seat).toMatch(/^C\d+$/);
    expect(await database('ticket_checkins').where({ ticket_id: ticketId }).first())
      .toMatchObject({ showtime_id: 1, gate: 'Cổng A', staff_user_id: USERS.staff, staff_name: 'Lê Văn Cổng' });
  });

  test('S-30 + S-26: QR giả, bị sửa hoặc ký bằng khoá khác -> từ chối, không ghi lượt vào', async () => {
    const ticketId = await issueTicket(1);
    const real = signTicketCode(ticketId);
    const forged = [
      `${real.slice(0, -1)}${real.at(-1) === 'A' ? 'B' : 'A'}`,
      signTicketCode(ticketId, { TICKET_QR_SECRET: 'attacker-guessed-secret-of-32-chars!!' }),
      `ET1.${ticketId}`,
      ticketId,
      'https://example.com/fake-ticket',
    ];
    for (const qrCode of forged) {
      const res = await scan(USERS.staff, { qrCode, showtimeId: 1, gate: 'Cổng A' });
      expect(res.status).toBe(200);
      expect(result(res)).toMatchObject({ accepted: false, code: 'INVALID_QR' });
    }
    expect(await database('ticket_checkins').where({ ticket_id: ticketId })).toHaveLength(0);
  });

  test('S-30: vé của suất khác -> "không thuộc suất đang soát", kèm suất của vé; vé bị huỷ -> từ chối', async () => {
    const otherShowtimeTicket = await issueTicket(2);
    const wrong = await scan(USERS.staff, { qrCode: signTicketCode(otherShowtimeTicket), showtimeId: 1, gate: 'Cổng A' });
    expect(result(wrong)).toMatchObject({ accepted: false, code: 'WRONG_SHOWTIME', ticket: { showtime: { id: 2 } } });

    const voided = await issueTicket(1, 'void');
    expect(result(await scan(USERS.staff, { qrCode: signTicketCode(voided), showtimeId: 1, gate: 'Cổng A' })))
      .toMatchObject({ accepted: false, code: 'TICKET_VOID' });
    expect(await database('ticket_checkins').whereIn('ticket_id', [otherShowtimeTicket, voided])).toHaveLength(0);
  });

  test('S-31 nối thật: quét lại ở cổng khác -> báo đã dùng, kèm cổng + thời điểm lần đầu', async () => {
    const qrCode = signTicketCode(await issueTicket(1));
    const first = result(await scan(USERS.staff, { qrCode, showtimeId: 1, gate: 'Cổng A' }));
    const again = result(await scan(USERS.supervisor, { qrCode, showtimeId: 1, gate: 'Cổng B' }));

    expect(again).toMatchObject({ accepted: false, code: 'ALREADY_CHECKED_IN', firstAdmission: { gate: 'Cổng A', staffName: 'Lê Văn Cổng' } });
    expect(again.firstAdmission.checkedInAt).toBe(first.admission.checkedInAt);
  });

  test('S-31 nối thật: 20 máy quét cùng lúc một vé -> đúng 1 lượt vào', async () => {
    const qrCode = signTicketCode(await issueTicket(1));
    const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => scan(i % 2 ? USERS.staff : USERS.supervisor,
      { qrCode, showtimeId: 1, gate: i % 2 ? 'Cổng A' : 'Cổng B' })));
    const codes = responses.map((res) => result(res).code);
    expect(codes.filter((code) => code === 'CHECKED_IN')).toHaveLength(1);
    expect(codes.filter((code) => code === 'ALREADY_CHECKED_IN')).toHaveLength(19);
  });

  test('S-31 nối thật: chỉ trưởng ca cho vào có ghi chú; gửi lại cùng yêu cầu không cho vào thêm', async () => {
    const ticketId = await issueTicket(1);
    const qrCode = signTicketCode(ticketId);
    await scan(USERS.staff, { qrCode, showtimeId: 1, gate: 'Cổng A' });
    const body = { qrCode, showtimeId: 1, gate: 'Cổng B', reason: 'Khách ra ngoài lấy đồ, đã kiểm tra CCCD', requestId: crypto.randomUUID() };

    const denied = await note(USERS.staff, body);
    expect([denied.status, denied.body.code]).toEqual([403, 'OVERRIDE_FORBIDDEN']);
    const admitted = await note(USERS.supervisor, body);
    expect(result(admitted)).toMatchObject({ accepted: true, code: 'ADMITTED_WITH_NOTE', admission: { staffName: 'Trần Trưởng Ca', gate: 'Cổng B' } });
    expect(result(await note(USERS.supervisor, body))).toMatchObject({ accepted: false, code: 'OVERRIDE_ALREADY_RECORDED' });
    expect((await note(USERS.supervisor, { ...body, reason: '' })).body.code).toBe('INVALID_OVERRIDE');
    expect(await database('ticket_checkin_overrides').where({ ticket_id: ticketId })).toHaveLength(1);
    expect(await database('ticket_checkins').where({ ticket_id: ticketId }).first()).toMatchObject({ gate: 'Cổng A' });
  });

  test('S-28 + S-30: người mua không quét được; nhân viên đã bị khoá (JWT cũ còn hạn) bị chặn ngay', async () => {
    const qrCode = signTicketCode(await issueTicket(1));
    expect((await scan(USERS.buyer, { qrCode, showtimeId: 1, gate: 'Cổng A' })).status).toBe(403);
    const locked = await scan(USERS.lockedStaff, { qrCode, showtimeId: 1, gate: 'Cổng A' });
    expect([locked.status, locked.body.code]).toEqual([403, 'SCANNER_FORBIDDEN']);
    expect((await request(app).post('/api/scanner/scan').send({ qrCode, showtimeId: 1, gate: 'Cổng A' })).status).toBe(401);
    expect(await database('ticket_checkins').where({ staff_user_id: USERS.lockedStaff })).toHaveLength(0);
  });
});
