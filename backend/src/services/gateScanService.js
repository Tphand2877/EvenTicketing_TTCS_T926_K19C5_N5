const db = require('../config/database');
const { verifyTicketCode } = require('../utils/ticketQr');
const { createTicketAdmissionService } = require('./ticketAdmissionService');

/**
 * S-29 / S-30: nhân viên chọn suất + cổng, rồi quét QR có chữ ký (S-26) của vé (S-25).
 * Đây là adapter withAuthorizedTicket mà S-31 (ticketAdmissionService) yêu cầu:
 * kiểm chữ ký -> khoá vé + nhân viên trong cùng transaction -> S-31 ghi lượt vào -> commit.
 */
const SCANNER_ROLES = ['staff', 'supervisor', 'admin'];
const OVERRIDE_ROLES = ['supervisor', 'admin'];
const DEFAULT_GATES = ['Cổng chính'];
const MAX_GATES = 20;

/** Kết quả soát vé không cho vào (QR sai, vé huỷ, sai suất...). Không phải lỗi máy chủ. */
class ScanRejected extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'ScanRejected';
    this.code = code;
    this.details = details;
  }
}

/** Yêu cầu không hợp lệ (chưa chọn suất/cổng, không có quyền...). */
class ScanRequestError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'ScanRequestError';
    this.code = code;
    this.status = status;
  }
}

const positiveId = (value) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

const presentTicket = (row) => ({
  id: row.id,
  code: row.id.slice(0, 8).toUpperCase(),
  seat: `${row.row_label}${row.seat_number}`,
  category: row.category_name,
  showtime: { id: row.showtime_id, startsAt: row.starts_at },
  event: { id: row.event_id, title: row.title },
});

const createGateScanService = ({ database = db, env = process.env, admissionFactory = createTicketAdmissionService } = {}) => {
  const gatesFor = async (eventId, trx = database) => {
    const rows = await trx('event_gates').where({ event_id: eventId }).orderBy(['position', 'id']).pluck('name');
    return rows.length > 0 ? rows : DEFAULT_GATES;
  };

  // Mọi lần quét đều đọc vai trò + trạng thái từ DB: tài khoản bị khoá/hạ quyền (S-28) mất quyền ngay.
  const loadStaff = (trx, actorId) => trx('users')
    .join('roles', 'roles.id', 'users.role_id')
    .select('users.id', 'users.is_active', 'roles.name as role')
    .where('users.id', actorId)
    .forShare('users')
    .first();

  const access = {
    async withAuthorizedTicket(input, operation) {
      const verified = verifyTicketCode(input.qrCode, env);
      if (!verified.valid) throw new ScanRejected('INVALID_QR', { reason: verified.reason });

      return database.transaction(async (transaction) => {
        const staff = await loadStaff(transaction, input.actorId);
        if (!staff || !staff.is_active || !SCANNER_ROLES.includes(staff.role)) {
          throw new ScanRequestError('SCANNER_FORBIDDEN', 403);
        }
        const canOverride = OVERRIDE_ROLES.includes(staff.role);
        if (input.permission === 'override' && !canOverride) throw new ScanRequestError('OVERRIDE_FORBIDDEN', 403);

        // FOR SHARE trên vé và đơn: huỷ vé không chen được giữa lúc kiểm và lúc ghi lượt vào
        const ticket = await transaction('tickets as ticket')
          .join('orders as ord', 'ord.id', 'ticket.order_id')
          .join('order_items as item', 'item.id', 'ticket.order_item_id')
          .join('seats as seat', 'seat.id', 'ticket.seat_id')
          .join('showtimes as showtime', 'showtime.id', 'ticket.showtime_id')
          .join('events as event', 'event.id', 'showtime.event_id')
          .select('ticket.id', 'ticket.status', 'ticket.showtime_id', 'ord.status as order_status',
            'seat.row_label', 'seat.seat_number', 'item.category_name', 'showtime.starts_at',
            'event.id as event_id', 'event.title')
          .where('ticket.id', verified.ticketId)
          .forShare('ticket', 'ord')
          .first();
        if (!ticket) throw new ScanRejected('TICKET_NOT_FOUND');
        const presented = presentTicket(ticket);
        if (ticket.status !== 'valid' || ticket.order_status !== 'paid') throw new ScanRejected('TICKET_VOID', { ticket: presented });
        if (ticket.showtime_id !== input.showtimeId) throw new ScanRejected('WRONG_SHOWTIME', { ticket: presented });

        const result = await operation({
          transaction,
          ticket: { id: ticket.id, showtimeId: ticket.showtime_id },
          staff: { id: staff.id, canScan: true, canOverride },
        });
        return { ...result, ticket: presented };
      });
    },
  };
  const admission = admissionFactory({ access });

  // S-29: suất phải tồn tại, không phải nháp; cổng phải thuộc danh sách cổng của sự kiện
  const assertContext = async ({ showtimeId, gate }) => {
    const id = positiveId(showtimeId);
    if (!id) throw new ScanRequestError('SHOWTIME_REQUIRED', 400);
    if (typeof gate !== 'string' || !gate.trim()) throw new ScanRequestError('GATE_REQUIRED', 400);
    const showtime = await database('showtimes').select('id', 'event_id', 'status').where({ id }).first();
    if (!showtime || showtime.status === 'draft') throw new ScanRequestError('SHOWTIME_INVALID', 400);
    const gates = await gatesFor(showtime.event_id);
    if (!gates.includes(gate.trim())) throw new ScanRequestError('GATE_INVALID', 400);
    return { showtimeId: id, gate: gate.trim() };
  };

  const settle = async (run) => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ScanRejected) return { accepted: false, code: error.code, ...error.details };
      throw error;
    }
  };

  return {
    gatesFor,

    /** Suất để chọn khi soát vé: chưa quá 1 ngày kể từ giờ bắt đầu, không phải nháp. */
    async listShowtimes() {
      const rows = await database('showtimes as showtime')
        .join('events as event', 'event.id', 'showtime.event_id')
        .select('showtime.id', 'showtime.starts_at', 'showtime.status', 'event.id as event_id', 'event.title', 'event.venue')
        .select(database.raw("(SELECT count(*) FROM tickets t WHERE t.showtime_id = showtime.id AND t.status = 'valid')::int AS tickets"))
        .select(database.raw('(SELECT count(*) FROM ticket_checkins c WHERE c.showtime_id = showtime.id)::int AS checked_in'))
        .whereNot('showtime.status', 'draft')
        .where('showtime.starts_at', '>=', database.raw("now() - interval '1 day'"))
        .orderBy([{ column: 'showtime.starts_at' }, { column: 'showtime.id' }])
        .limit(100);
      const gatesByEvent = new Map();
      for (const eventId of new Set(rows.map((row) => row.event_id))) gatesByEvent.set(eventId, await gatesFor(eventId));
      return rows.map((row) => ({
        id: row.id,
        startsAt: row.starts_at,
        status: row.status,
        event: { id: row.event_id, title: row.title, venue: row.venue },
        gates: gatesByEvent.get(row.event_id),
        tickets: row.tickets,
        checkedIn: row.checked_in,
      }));
    },

    async scan({ actorId, qrCode, showtimeId, gate }) {
      const context = await assertContext({ showtimeId, gate });
      return settle(() => admission.admit({ qrCode, actorId, ...context }));
    },

    async admitWithNote({ actorId, qrCode, showtimeId, gate, reason, requestId }) {
      const context = await assertContext({ showtimeId, gate });
      return settle(() => admission.admitWithNote({ qrCode, actorId, ...context, reason, requestId }));
    },

    /** Organizer/admin khai báo cổng cho sự kiện (thay toàn bộ danh sách). */
    async replaceGates(eventId, gates) {
      if (!Array.isArray(gates) || gates.length === 0 || gates.length > MAX_GATES) {
        throw new ScanRequestError('GATES_INVALID', 400);
      }
      const names = gates.map((name) => (typeof name === 'string' ? name.trim() : ''));
      const lowered = new Set(names.map((name) => name.toLowerCase()));
      if (names.some((name) => !name || name.length > 100) || lowered.size !== names.length) {
        throw new ScanRequestError('GATES_INVALID', 400);
      }
      await database.transaction(async (trx) => {
        await trx('event_gates').where({ event_id: eventId }).del();
        await trx('event_gates').insert(names.map((name, position) => ({ event_id: eventId, name, position })));
      });
      return names;
    },
  };
};

module.exports = { DEFAULT_GATES, OVERRIDE_ROLES, SCANNER_ROLES, ScanRejected, ScanRequestError, createGateScanService };
