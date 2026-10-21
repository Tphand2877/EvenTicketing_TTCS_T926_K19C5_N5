const { createTicketAdmissionRepository } = require('../repositories/ticketAdmissionRepository');

class TicketAdmissionError extends Error {
  constructor(code, status = 400) {
    super('Ticket admission could not be completed.');
    this.code = code;
    this.status = status;
  }
}
const text = (value, max) => typeof value === 'string'
  && value.trim().length > 0 && value.length <= max && !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
const positiveId = (value) => Number.isSafeInteger(value) && value > 0;
const uuid = (value) => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/**
 * S-30 supplies withAuthorizedTicket. It verifies QR/ticket/staff/gate and holds
 * a ticket SHARE lock in the SAME transaction until this operation commits.
 * There is deliberately no HTTP route accepting an unverified ticket ID.
 */
const createTicketAdmissionService = ({ access, repository = createTicketAdmissionRepository() } = {}) => {
  if (typeof access?.withAuthorizedTicket !== 'function') {
    throw new Error('S-31 requires the S-30 authorized ticket adapter.');
  }
  const run = async (input = {}, override = false) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new TicketAdmissionError('INVALID_SCAN_CONTEXT');
    }
    const { qrCode, actorId, showtimeId, gate } = input;
    if (!text(qrCode, 16384) || !positiveId(actorId) || !positiveId(showtimeId) || !text(gate, 100)) {
      throw new TicketAdmissionError('INVALID_SCAN_CONTEXT');
    }
    if (override && (!text(input.reason, 500) || !uuid(input.requestId))) {
      throw new TicketAdmissionError('INVALID_OVERRIDE');
    }
    return access.withAuthorizedTicket({ qrCode, actorId, showtimeId, gate: gate.trim(),
      permission: override ? 'override' : 'scan' }, async (context) => {
      if (typeof context?.transaction !== 'function' || context.transaction.isTransaction !== true
        || !text(context.ticket?.id, 200) || context.ticket.showtimeId !== showtimeId
        || context.staff?.id !== actorId || context.staff.canScan !== true) {
        throw new TicketAdmissionError('UNAUTHORIZED_TICKET_CONTEXT', 403);
      }
      if (override && context.staff.canOverride !== true) {
        throw new TicketAdmissionError('OVERRIDE_FORBIDDEN', 403);
      }
      const args = { ticketId: context.ticket.id, showtimeId, staffUserId: actorId, gate: gate.trim() };
      if (override) {
        return repository.admitWithNote(context.transaction, { ...args,
          reason: input.reason.trim(), requestId: input.requestId.toLowerCase() });
      }
      return repository.admitOnce(context.transaction, args);
    });
  };
  return { admit: (input) => run(input), admitWithNote: (input) => run(input, true) };
};

module.exports = { TicketAdmissionError, createTicketAdmissionService };
