/**
 * S-28: admin tạo tài khoản nhân viên và gán vai trò. Chạy migrations thật trên PostgreSQL,
 * đăng nhập thật qua /api/auth/login để chứng minh tài khoản tạo ra dùng được ngay.
 */
process.env.JWT_SECRET = 's28-auth-test-only';

const crypto = require('crypto');
const path = require('path');
const jwt = require('jsonwebtoken');
const knex = require('knex');
const request = require('supertest');
const config = require('../knexfile').test;
const { hashPassword } = require('../src/utils/passwordHash');

const schema = `s28_test_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const mockDatabase = knex({
  ...config,
  connection: { ...config.connection, database: process.env.DB_NAME_TEST || config.connection.database },
  searchPath: [schema],
  pool: { min: 0, max: 5 },
});
jest.mock('../src/config/database', () => mockDatabase);
const app = require('../src/app');
const database = mockDatabase;
const describeDatabase = process.env.RUN_STAFF_ACCOUNT_DB_TESTS === '1' ? describe : describe.skip;

const ADMIN_ID = 1;
const bearer = (userId, role) => `Bearer ${jwt.sign({ userId, role, email: `${role}@s28.test` }, process.env.JWT_SECRET)}`;
const asAdmin = (req) => req.set('Authorization', bearer(ADMIN_ID, 'admin'));
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });
const newStaff = (overrides = {}) => ({
  email: `gate-${crypto.randomBytes(3).toString('hex')}@s28.test`, fullName: 'Nguyễn Văn Soát', password: 'Cong-A-2026', role: 'staff', ...overrides,
});

describeDatabase('S-28: admin tạo tài khoản nhân viên và gán vai trò', () => {
  beforeAll(async () => {
    await database.schema.createSchema(schema);
    await database.migrate.latest({ directory: path.join(__dirname, '../src/migrations') });
    // Giống DB đang chạy: đã có 3 vai trò cũ, chạy lại migration S-28 thì có thêm staff/supervisor
    await database('roles').insert(['admin', 'organizer', 'buyer'].map((name) => ({ name })));
    await require('../src/migrations/202610210201_add_staff_roles').up(database);
    const roleId = async (name) => (await database('roles').where({ name }).first()).id;
    await database('users').insert([
      { id: ADMIN_ID, email: 'admin@s28.test', password_hash: await hashPassword('Admin-2026'), role_id: await roleId('admin'), is_active: true },
      { id: 2, email: 'buyer@s28.test', password_hash: 'x', role_id: await roleId('buyer'), is_active: true },
    ]);
    await database.raw("SELECT setval(pg_get_serial_sequence('users', 'id'), 100)");
  }, 30000);

  afterAll(async () => {
    await require('../src/services/showtimePageCache').close();
    await database.schema.dropSchemaIfExists(schema, true);
    await database.destroy();
  });

  test('migration có sẵn vai trò staff và supervisor', async () => {
    const res = await asAdmin(request(app).get('/api/admin/roles'));
    expect(res.status).toBe(200);
    expect(res.body.data.roles.map((r) => r.name)).toEqual(expect.arrayContaining(['admin', 'organizer', 'buyer', 'staff', 'supervisor']));
  });

  test('AC1: admin tạo tài khoản nhân viên soát vé -> đăng nhập được ngay với vai trò staff', async () => {
    const body = newStaff({ email: '  Gate.A@S28.test ' });
    const res = await asAdmin(request(app).post('/api/admin/users').send(body));

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email: 'gate.a@s28.test', fullName: 'Nguyễn Văn Soát', role: 'staff', isActive: true, createdBy: ADMIN_ID });
    const row = await database('users').where({ email: 'gate.a@s28.test' }).first();
    expect(row.password_hash).not.toContain(body.password);
    expect(row.password_hash).toMatch(/^\$argon2id\$/);

    const loggedIn = await login('gate.a@s28.test', body.password);
    expect(loggedIn.status).toBe(200);
    expect(jwt.verify(loggedIn.body.data.accessToken, process.env.JWT_SECRET)).toMatchObject({ role: 'staff' });
  });

  test('AC2: admin gán lại vai trò (staff -> supervisor) và khoá tài khoản; tài khoản bị khoá không đăng nhập được', async () => {
    const body = newStaff();
    const { id } = (await asAdmin(request(app).post('/api/admin/users').send(body))).body.data.user;

    const promoted = await asAdmin(request(app).patch(`/api/admin/users/${id}`).send({ role: 'supervisor' }));
    expect(promoted.status).toBe(200);
    expect(promoted.body.data.user.role).toBe('supervisor');
    const token = (await login(body.email, body.password)).body.data.accessToken;
    expect(jwt.decode(token).role).toBe('supervisor');

    const locked = await asAdmin(request(app).patch(`/api/admin/users/${id}`).send({ isActive: false }));
    expect(locked.body.data.user.isActive).toBe(false);
    expect((await login(body.email, body.password)).status).not.toBe(200);
  });

  test('AC3: chỉ admin được tạo/sửa tài khoản; organizer, buyer, staff bị 403, chưa đăng nhập bị 401', async () => {
    for (const role of ['organizer', 'buyer', 'staff', 'supervisor']) {
      const res = await request(app).post('/api/admin/users').set('Authorization', bearer(2, role)).send(newStaff({ role: 'admin' }));
      expect(res.status).toBe(403);
      expect((await request(app).patch('/api/admin/users/2').set('Authorization', bearer(2, role)).send({ role: 'admin' })).status).toBe(403);
    }
    expect((await request(app).post('/api/admin/users').send(newStaff())).status).toBe(401);
    expect((await database('users').where({ id: 2 }).first()).role_id)
      .toBe((await database('roles').where({ name: 'buyer' }).first()).id);
  });

  test('Dữ liệu sai bị từ chối, không tạo tài khoản', async () => {
    const before = Number((await database('users').count({ n: '*' }).first()).n);
    const cases = [
      [newStaff({ email: 'khong-phai-email' }), 400, 'EMAIL_INVALID'],
      [newStaff({ password: '1234567' }), 400, 'PASSWORD_TOO_SHORT'],
      [newStaff({ fullName: '   ' }), 400, 'FULL_NAME_REQUIRED'],
      [newStaff({ role: 'superuser' }), 400, 'ROLE_INVALID'],
      [newStaff({ email: 'BUYER@s28.test' }), 409, 'EMAIL_TAKEN'],
    ];
    for (const [body, status, code] of cases) {
      const res = await asAdmin(request(app).post('/api/admin/users').send(body));
      expect([res.status, res.body.code]).toEqual([status, code]);
    }
    expect(Number((await database('users').count({ n: '*' }).first()).n)).toBe(before);
  });

  test('Admin không tự hạ quyền hay tự khoá mình; vai trò lạ hoặc tài khoản không tồn tại bị từ chối', async () => {
    expect((await asAdmin(request(app).patch(`/api/admin/users/${ADMIN_ID}`).send({ role: 'buyer' }))).body.code).toBe('CANNOT_CHANGE_SELF');
    expect((await asAdmin(request(app).patch(`/api/admin/users/${ADMIN_ID}`).send({ isActive: false }))).status).toBe(409);
    expect((await asAdmin(request(app).patch('/api/admin/users/2').send({ role: 'root' }))).body.code).toBe('ROLE_INVALID');
    expect((await asAdmin(request(app).patch('/api/admin/users/99999').send({ role: 'staff' }))).status).toBe(404);
    expect((await database('users').where({ id: ADMIN_ID }).first()).is_active).toBe(true);
  });

  test('Danh sách tài khoản lọc theo vai trò và tìm theo tên/email', async () => {
    await asAdmin(request(app).post('/api/admin/users').send(newStaff({ email: 'lead.b@s28.test', fullName: 'Trần Thị Trưởng Ca', role: 'supervisor' })));
    const supervisors = await asAdmin(request(app).get('/api/admin/users').query({ role: 'supervisor' }));
    expect(supervisors.status).toBe(200);
    expect(supervisors.body.data.users.every((u) => u.role === 'supervisor')).toBe(true);
    const found = await asAdmin(request(app).get('/api/admin/users').query({ q: 'trưởng ca' }));
    expect(found.body.data.users.map((u) => u.email)).toEqual(['lead.b@s28.test']);
    expect(found.body.data.users[0]).not.toHaveProperty('password_hash');
  });
});
