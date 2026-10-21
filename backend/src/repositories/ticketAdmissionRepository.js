const crypto = require('crypto');

// Kept independent of the unfinished ticket schema; all DB access uses S-30's transaction.
const entry = (row) => ({ ticketId: row.ticket_id, showtimeId: row.showtime_id,
  gate: row.gate, checkedInAt: new Date(row.checked_in_at).toISOString(),
  staffUserId: row.staff_user_id, staffName: row.staff_name });
const failure = (code, status = 409) => Object.assign(new Error('Ticket admission could not be completed.'), { code, status });
const staffName = async (transaction, id, requireName = false) => {
  const staff = await transaction('users').select('id', 'full_name')
    .where({ id, is_active: true }).forShare().first();
  if (!staff) throw failure('STAFF_NOT_ACTIVE', 403);
  const name = staff.full_name?.trim();
  if (requireName && !name) throw failure('STAFF_NAME_REQUIRED');
  return name || `Staff #${id}`;
};
const assertShowtime = (row, showtimeId) => {
  if (!row || row.showtime_id !== showtimeId) throw failure('TICKET_CONTEXT_MISMATCH');
};
const overrideEntry = (row, first) => ({ id: row.id, requestId: row.request_id,
  ...entry({ ...row, showtime_id: first.showtime_id }), reason: row.reason });

const createTicketAdmissionRepository = () => ({
  async admitOnce(transaction, { ticketId, showtimeId, staffUserId, gate }) {
    const name = await staffName(transaction, staffUserId);
    // The PK is the arbiter across workers/devices, not a process-local check.
    const [created] = await transaction('ticket_checkins').insert({ ticket_id: ticketId,
      showtime_id: showtimeId, gate, staff_user_id: staffUserId, staff_name: name })
      .onConflict('ticket_id').ignore().returning('*');
    if (created) return { accepted: true, code: 'CHECKED_IN', admission: entry(created) };
    // Separate statement: after ON CONFLICT waits, READ COMMITTED sees the winner.
    const first = await transaction('ticket_checkins').where({ ticket_id: ticketId }).first();
    assertShowtime(first, showtimeId);
    return { accepted: false, code: 'ALREADY_CHECKED_IN', firstAdmission: entry(first) };
  },

  async admitWithNote(transaction, { ticketId, showtimeId, staffUserId, gate, reason, requestId }) {
    const first = await transaction('ticket_checkins').where({ ticket_id: ticketId }).forUpdate().first();
    if (!first) throw failure('TICKET_NOT_CHECKED_IN');
    assertShowtime(first, showtimeId);
    const name = await staffName(transaction, staffUserId, true);
    const [created] = await transaction('ticket_checkin_overrides').insert({ id: crypto.randomUUID(),
      ticket_id: ticketId, request_id: requestId, gate, staff_user_id: staffUserId,
      staff_name: name, reason }).onConflict(['ticket_id', 'request_id']).ignore().returning('*');
    if (created) return { accepted: true, code: 'ADMITTED_WITH_NOTE', replayed: false,
      admission: overrideEntry(created, first), firstAdmission: entry(first) };
    const previous = await transaction('ticket_checkin_overrides')
      .where({ ticket_id: ticketId, request_id: requestId }).first();
    if (!previous || previous.staff_user_id !== staffUserId || previous.gate !== gate || previous.reason !== reason) {
      throw failure('OVERRIDE_REQUEST_CONFLICT');
    }
    // A retry acknowledges the previous decision; it does not admit someone again.
    return { accepted: false, code: 'OVERRIDE_ALREADY_RECORDED', replayed: true,
      admission: overrideEntry(previous, first), firstAdmission: entry(first) };
  },
});

module.exports = { createTicketAdmissionRepository };
