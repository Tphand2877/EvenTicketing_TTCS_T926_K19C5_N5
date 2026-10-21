/** S-31 ledger tests. Ticket resolution/grants are S-30 fixtures, not a QR implementation. */
const crypto = require('crypto');
const path = require('path');
const knex = require('knex');
const config = require('../knexfile').test;
const { createTicketAdmissionService } = require('../src/services/ticketAdmissionService');
const enabled = process.env.RUN_TICKET_ADMISSION_DB_TESTS === '1';
const dbName = process.env.TICKET_ADMISSION_DB_NAME_TEST || process.env.DB_NAME_TEST;
if (enabled && (!dbName || !/test/i.test(dbName) || dbName === process.env.DB_NAME)) {
  throw new Error('Set TICKET_ADMISSION_DB_NAME_TEST to a separate disposable database.');
}
const schema = `s31_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const dbConfig = { ...config, connection: { ...config.connection, database: dbName || 's31_test' },
  searchPath: [schema], pool: { min: 0, max: 12 } };
const database = knex(dbConfig);
const otherWorker = knex(dbConfig);
const ticketId = '11111111-1111-4111-8111-111111111111';
const scan = { qrCode: 'fixture-verified-ticket', actorId: 2, showtimeId: 1, gate: 'A' };
const withNote = { ...scan, gate: 'B', reason: 'Identity checked at gate B.',
  requestId: '22222222-2222-4222-8222-222222222222' };
const count = async (table) => Number((await database(table).count('* AS n').first()).n);

// S-30's future adapter must verify real signatures, ticket validity, staff and gate.
// This fixture supplies those decisions from fixture rows and a real shared DB transaction.
const fixtureAccess = (db) => ({
  withAuthorizedTicket: (input, operation) => db.transaction(async (transaction) => {
    const ticket = await transaction('fixture_issued_tickets').where({ qr: input.qrCode,
      showtime_id: input.showtimeId, status: 'valid' }).forShare().first();
    const grant = await transaction('fixture_staff_grants').where({ user_id: input.actorId,
      showtime_id: input.showtimeId, gate: input.gate }).forShare().first();
    if (!ticket || !grant) throw Object.assign(new Error('Fixture access rejected.'), { code: 'INVALID_TICKET_OR_GRANT' });
    return operation({ transaction, ticket: { id: ticket.id, showtimeId: ticket.showtime_id },
      staff: { id: grant.user_id, canScan: true, canOverride: grant.can_override } });
  }),
});
const service = (db = database) => createTicketAdmissionService({ access: fixtureAccess(db) });
const databaseTests = enabled ? describe : describe.skip;

databaseTests('S-31: PostgreSQL duplicate admission and override audit', () => {
  beforeAll(async () => {
    await database.schema.createSchema(schema);
    await database.migrate.latest({ directory: path.join(__dirname, '../src/migrations') });
    await database('roles').insert({ id: 1, name: 'checkin_fixture' });
    await database('users').insert([
      { id: 1, full_name: 'Organizer fixture', email: 'organizer@s31.example.test', password_hash: 'fixture', role_id: 1, is_active: true },
      { id: 2, full_name: 'Gate supervisor', email: 'staff2@s31.example.test', password_hash: 'fixture', role_id: 1, is_active: true },
      { id: 3, full_name: 'Gate scanner', email: 'staff3@s31.example.test', password_hash: 'fixture', role_id: 1, is_active: true },
    ]);
    await database('events').insert({ id: 1, organizer_id: 1, title: 'S31 fixture', venue: 'Test' });
    await database('showtimes').insert([
      { id: 1, event_id: 1, capacity: 100, starts_at: '2099-01-01' },
      { id: 2, event_id: 1, capacity: 100, starts_at: '2099-01-02' },
    ]);
    await database.schema.createTable('fixture_issued_tickets', (table) => {
      table.string('id', 200).primary(); table.string('qr').unique();
      table.integer('showtime_id'); table.string('status');
    });
    await database.schema.createTable('fixture_staff_grants', (table) => {
      table.integer('user_id'); table.integer('showtime_id'); table.string('gate');
      table.boolean('can_override'); table.primary(['user_id', 'showtime_id', 'gate']);
    });
    await database('fixture_issued_tickets').insert({ id: ticketId, qr: scan.qrCode, showtime_id: 1, status: 'valid' });
    await database('fixture_staff_grants').insert([2, 3].flatMap((id) => ['A', 'B'].map((gate) => ({
      user_id: id, showtime_id: 1, gate, can_override: id === 2,
    }))));
  }, 30000);
  beforeEach(async () => {
    await database('ticket_checkin_overrides').del();
    await database('ticket_checkins').del();
    await database('fixture_issued_tickets').update({ status: 'valid' });
    await database('users').where({ id: 2 }).update({ full_name: 'Gate supervisor', is_active: true });
  });
  afterAll(async () => {
    await otherWorker.destroy();
    await database.schema.dropSchemaIfExists(schema, true);
    await database.destroy();
  });

  test('AC1: another gate receives the original entry gate/time; no admission is overwritten', async () => {
    const first = await service().admit({ ...scan, checkedInAt: '1999-01-01' });
    const original = await database('ticket_checkins').first();
    const duplicate = await service(otherWorker).admit({ ...scan, gate: 'B', actorId: 3 });
    expect(first).toMatchObject({ accepted: true, code: 'CHECKED_IN' });
    expect(duplicate).toMatchObject({ accepted: false, code: 'ALREADY_CHECKED_IN', firstAdmission: {
      gate: 'A', checkedInAt: first.admission.checkedInAt,
    } });
    expect(new Date(first.admission.checkedInAt).getUTCFullYear()).toBeGreaterThan(2020);
    expect(await database('ticket_checkins').first()).toEqual(original);
    expect(await count('ticket_checkins')).toBe(1);
  });
  test('AC2: 20 concurrent scans across two workers accept exactly one entry', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      service(i % 2 ? otherWorker : database).admit({ ...scan, gate: i % 2 ? 'B' : 'A' })));
    expect(results.filter((r) => r.accepted)).toHaveLength(1);
    expect(results.filter((r) => r.code === 'ALREADY_CHECKED_IN')).toHaveLength(19);
    const winner = results.find((r) => r.accepted).admission;
    expect(results.filter((r) => !r.accepted).every((r) => r.firstAdmission.checkedInAt === winner.checkedInAt
      && r.firstAdmission.gate === winner.gate)).toBe(true);
    expect(await count('ticket_checkins')).toBe(1);
  });
  test('the database constraint rejects another normal entry even without the service', async () => {
    await service().admit(scan);
    await expect(otherWorker('ticket_checkins').insert({ ticket_id: ticketId, showtime_id: 1,
      gate: 'B', staff_user_id: 3, staff_name: 'Other staff' })).rejects.toMatchObject({ code: '23505' });
  });
  test('AC3: authorized override appends the reason and DB staff name without resetting the first entry', async () => {
    await service().admit(scan);
    const first = await database('ticket_checkins').first();
    const result = await service().admitWithNote({ ...withNote, staffName: 'Browser spoof' });
    expect(result).toMatchObject({ accepted: true, code: 'ADMITTED_WITH_NOTE', replayed: false,
      admission: { reason: withNote.reason, gate: 'B', staffUserId: 2, staffName: 'Gate supervisor' } });
    expect(await database('ticket_checkins').first()).toEqual(first);
    expect(await count('ticket_checkin_overrides')).toBe(1);
    expect((await service().admit(scan)).code).toBe('ALREADY_CHECKED_IN');
  });
  test('20 retries of one override request append one audit record', async () => {
    await service().admit(scan);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      service(i % 2 ? otherWorker : database).admitWithNote(withNote)));
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(results.filter((r) => r.accepted)).toHaveLength(1);
    expect(results.filter((r) => r.code === 'OVERRIDE_ALREADY_RECORDED')).toHaveLength(19);
    expect(new Set(results.map((r) => r.admission.id)).size).toBe(1);
    expect(await count('ticket_checkin_overrides')).toBe(1);
  });
  test('a separately confirmed override appends another record and preserves the first entry', async () => {
    await service().admit(scan);
    const original = await database('ticket_checkins').first();
    await service().admitWithNote(withNote);
    const another = await service().admitWithNote({ ...withNote,
      requestId: crypto.randomUUID(), reason: 'Separate confirmation by supervisor.' });
    expect(another.accepted).toBe(true);
    expect(await count('ticket_checkin_overrides')).toBe(2);
    expect(await database('ticket_checkins').first()).toEqual(original);
  });
  test('an override key reused with different content is rejected and preserves the audit', async () => {
    await service().admit(scan);
    await service().admitWithNote(withNote);
    await expect(service().admitWithNote({ ...withNote, reason: 'Changed' }))
      .rejects.toMatchObject({ code: 'OVERRIDE_REQUEST_CONFLICT' });
    expect(await count('ticket_checkin_overrides')).toBe(1);
  });
  test('missing reason, missing permission and an override without a first entry cannot admit', async () => {
    await expect(service().admitWithNote(withNote)).rejects.toMatchObject({ code: 'TICKET_NOT_CHECKED_IN' });
    await service().admit(scan);
    await expect(service().admitWithNote({ ...withNote, reason: '' })).rejects.toMatchObject({ code: 'INVALID_OVERRIDE' });
    await expect(service().admitWithNote({ ...withNote, actorId: 3 })).rejects.toMatchObject({ code: 'OVERRIDE_FORBIDDEN' });
    expect(await count('ticket_checkin_overrides')).toBe(0);
  });
  test('inactive/unnamed staff cannot add an override', async () => {
    await service().admit(scan);
    await database('users').where({ id: 2 }).update({ is_active: false });
    await expect(service().admitWithNote(withNote)).rejects.toMatchObject({ code: 'STAFF_NOT_ACTIVE' });
    await database('users').where({ id: 2 }).update({ is_active: true, full_name: '  ' });
    await expect(service().admitWithNote(withNote)).rejects.toMatchObject({ code: 'STAFF_NAME_REQUIRED' });
    expect(await count('ticket_checkin_overrides')).toBe(0);
  });
  test('invalid, voided or wrong-showtime tickets and unassigned gates do not consume a ticket', async () => {
    for (const change of [{ qrCode: 'unknown' }, { showtimeId: 2 }, { gate: 'C' }]) {
      await expect(service().admit({ ...scan, ...change })).rejects.toMatchObject({ code: 'INVALID_TICKET_OR_GRANT' });
    }
    await database('fixture_issued_tickets').update({ status: 'void' });
    await expect(service().admit(scan)).rejects.toMatchObject({ code: 'INVALID_TICKET_OR_GRANT' });
    expect(await count('ticket_checkins')).toBe(0);
  });
  test('failure after insertion rolls back the admission with the S-30 transaction', async () => {
    const access = fixtureAccess(database);
    const failing = createTicketAdmissionService({ access: { withAuthorizedTicket: (input, operation) =>
      access.withAuthorizedTicket(input, async (context) => {
        await operation(context);
        throw new Error('Injected failure before commit.');
      }) } });
    await expect(failing.admit(scan)).rejects.toThrow('Injected failure');
    expect(await count('ticket_checkins')).toBe(0);
    expect((await service(otherWorker).admit(scan)).accepted).toBe(true);
  });
  test('a fresh service/connection still rejects a ticket already admitted', async () => {
    await service().admit(scan);
    const fresh = knex(dbConfig);
    try { expect((await service(fresh).admit(scan)).code).toBe('ALREADY_CHECKED_IN'); }
    finally { await fresh.destroy(); }
  });
  test('S-31 migration rolls back and reapplies independently of ticket issuance', async () => {
    const migration = require('../src/migrations/202610210001_create_ticket_checkins');
    await migration.down(database);
    expect(await database.schema.hasTable('ticket_checkins')).toBe(false);
    await migration.up(database);
    expect(await database.schema.hasTable('ticket_checkin_overrides')).toBe(true);
    expect(await database.schema.hasTable('fixture_issued_tickets')).toBe(true);
  });
});
