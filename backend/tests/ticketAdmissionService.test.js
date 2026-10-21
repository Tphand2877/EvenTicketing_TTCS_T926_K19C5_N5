const { createTicketAdmissionService } = require('../src/services/ticketAdmissionService');

const scan = { qrCode: 'signed-qr-from-S30', actorId: 2, showtimeId: 1, gate: 'A' };
const override = { ...scan, reason: 'Holder identity confirmed at gate.',
  requestId: '22222222-2222-4222-8222-222222222222' };
const setup = (change = {}) => {
  const transaction = Object.assign(() => {}, { isTransaction: true });
  const context = { transaction, ticket: { id: 'canonical-ticket', showtimeId: 1 },
    staff: { id: 2, canScan: true, canOverride: true }, ...change };
  const repository = { admitOnce: jest.fn(async () => ({ accepted: true, code: 'CHECKED_IN' })),
    admitWithNote: jest.fn(async () => ({ accepted: true, code: 'ADMITTED_WITH_NOTE' })) };
  const access = { withAuthorizedTicket: jest.fn(async (_input, operation) => operation(context)) };
  return { service: createTicketAdmissionService({ access, repository }), repository, access, transaction };
};

test('requires S-30 authorization rather than providing a permissive default', () => {
  expect(() => createTicketAdmissionService()).toThrow('S-30');
});
test('null input has a controlled validation error', async () => {
  await expect(setup().service.admit(null)).rejects.toMatchObject({ code: 'INVALID_SCAN_CONTEXT' });
});
test('uses the canonical ticket and authenticated staff, not extra browser fields', async () => {
  const { service, repository, transaction } = setup();
  await expect(service.admit({ ...scan, ticketId: 'forged-ticket', staffName: 'Forged', checkedInAt: '1999-01-01' }))
    .resolves.toMatchObject({ accepted: true });
  expect(repository.admitOnce).toHaveBeenCalledWith(transaction, {
    ticketId: 'canonical-ticket', showtimeId: 1, staffUserId: 2, gate: 'A',
  });
});
test.each([
  { qrCode: '' }, { actorId: '2' }, { showtimeId: 0 }, { gate: '' }, { gate: 'A\nB' },
])('rejects invalid scan context before authorization: %j', async (change) => {
  const { service, access } = setup();
  await expect(service.admit({ ...scan, ...change })).rejects.toMatchObject({ code: 'INVALID_SCAN_CONTEXT' });
  expect(access.withAuthorizedTicket).not.toHaveBeenCalled();
});
test.each([
  { transaction: {} }, { ticket: { id: 'ticket', showtimeId: 99 } },
  { staff: { id: 99, canScan: true } }, { staff: { id: 2, canScan: false } },
])('rejects an unauthorized or inconsistent trusted context: %j', async (change) => {
  const { service, repository } = setup(change);
  await expect(service.admit(scan)).rejects.toMatchObject({ code: 'UNAUTHORIZED_TICKET_CONTEXT', status: 403 });
  expect(repository.admitOnce).not.toHaveBeenCalled();
});
test('S-30 rejecting a ticket cannot leave an admission', async () => {
  const { service, access, repository } = setup();
  access.withAuthorizedTicket.mockRejectedValueOnce(Object.assign(new Error('Rejected.'), { code: 'INVALID_TICKET' }));
  await expect(service.admit(scan)).rejects.toMatchObject({ code: 'INVALID_TICKET' });
  expect(repository.admitOnce).not.toHaveBeenCalled();
});
test.each([{ reason: '  ' }, { reason: 'x'.repeat(501) }, { requestId: 'not-a-uuid' }])(
  'override requires a reason and retry key: %j', async (change) => {
    const { service, access } = setup();
    await expect(service.admitWithNote({ ...override, ...change })).rejects.toMatchObject({ code: 'INVALID_OVERRIDE' });
    expect(access.withAuthorizedTicket).not.toHaveBeenCalled();
  });
test('ordinary scanner cannot override even by supplying a browser flag', async () => {
  const { service, repository } = setup({ staff: { id: 2, canScan: true, canOverride: false } });
  await expect(service.admitWithNote({ ...override, canOverride: true }))
    .rejects.toMatchObject({ code: 'OVERRIDE_FORBIDDEN', status: 403 });
  expect(repository.admitWithNote).not.toHaveBeenCalled();
});
test('override passes normalized note and retry key, with server identity', async () => {
  const { service, repository, access, transaction } = setup();
  await service.admitWithNote({ ...override, gate: ' B ', reason: '  Confirmed holder  ' });
  expect(access.withAuthorizedTicket).toHaveBeenCalledWith(expect.objectContaining({ permission: 'override', gate: 'B' }), expect.any(Function));
  expect(repository.admitWithNote).toHaveBeenCalledWith(transaction, {
    ticketId: 'canonical-ticket', showtimeId: 1, staffUserId: 2, gate: 'B',
    reason: 'Confirmed holder', requestId: override.requestId,
  });
});
test('database failure propagates so the shared transaction can roll back', async () => {
  const { service, repository } = setup();
  repository.admitOnce.mockRejectedValueOnce(new Error('Database operation failed.'));
  await expect(service.admit(scan)).rejects.toThrow('Database operation failed.');
});
