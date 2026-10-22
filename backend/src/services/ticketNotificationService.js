const db = require('../config/database');
const emailService = require('./emailService');
const { createTicketService } = require('./ticketService');

/**
 * SCRUM-223 [S-27]: gửi vé điện tử kèm QR qua email.
 *
 * Chỉ gửi SAU khi thanh toán đã commit (đơn paid + đã có vé). Mỗi đơn được "nhận việc" bằng một câu UPDATE
 * nguyên tử (ticket_email_claimed_at), nên webhook gửi lại hay nhiều server chạy cùng lúc cũng chỉ gửi một lần.
 * Gửi lỗi (SMTP) thì nhả việc để job thử lại, tối đa MAX_ATTEMPTS lần.
 */
const MAX_ATTEMPTS = 5;
const CLAIM_TIMEOUT = "interval '5 minutes'";
const RESEND_COOLDOWN_SECONDS = 60;

class TicketNotificationError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'TicketNotificationError';
    this.code = code;
    this.status = status;
  }
}

const createTicketEmailDispatcher = ({ database = db, ticketService = createTicketService(), email = emailService } = {}) => {
  const claim = async ({ orderId, limit = 1, force = false }) => {
    const { rows } = await database.raw(`
      UPDATE orders SET ticket_email_claimed_at = clock_timestamp(), ticket_email_attempts = ticket_email_attempts + 1
      WHERE id IN (
        SELECT id FROM orders
        WHERE status = 'paid'
          AND (${orderId ? 'id = :orderId' : 'TRUE'})
          AND (:force OR (ticket_email_sent_at IS NULL AND ticket_email_attempts < :maxAttempts))
          AND (ticket_email_claimed_at IS NULL OR ticket_email_claimed_at < clock_timestamp() - ${CLAIM_TIMEOUT})
        ORDER BY updated_at
        LIMIT :limit
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, user_id, total_amount, currency`, { orderId: orderId || null, limit, force, maxAttempts: MAX_ATTEMPTS });
    return rows;
  };

  const send = async (order) => {
    try {
      const user = await database('users').select('email', 'full_name').where({ id: order.user_id }).first();
      const tickets = await ticketService.ticketsForEmail(order.id);
      if (!user?.email || tickets.length === 0) throw new Error('Nothing to send.');
      await email.sendTicketEmail({ to: user.email, buyerName: user.full_name, order, tickets });
      await database('orders').where({ id: order.id })
        .update({ ticket_email_sent_at: database.raw('clock_timestamp()'), ticket_email_claimed_at: null });
      return true;
    } catch {
      // Không log email/địa chỉ/lỗi SMTP chi tiết (có thể chứa dữ liệu người mua)
      console.error('[TicketEmail] Delivery failed; will retry.');
      await database('orders').where({ id: order.id }).update({ ticket_email_claimed_at: null });
      return false;
    }
  };

  return {
    /** Gọi ngay sau khi webhook thanh toán commit. Đơn chưa paid hoặc đã gửi thì không làm gì. */
    async dispatchOrder(orderId) {
      const [order] = await claim({ orderId });
      return order ? send(order) : false;
    },

    /** Job: gửi các đơn đã thanh toán mà chưa gửi được email. Trả số email đã gửi. */
    async dispatchPending({ limit = 20 } = {}) {
      let sent = 0;
      for (const order of await claim({ limit })) if (await send(order)) sent += 1;
      return sent;
    },

    /** Người mua bấm "Gửi vé qua email": chỉ chủ đơn, đơn đã thanh toán, cách lần gửi trước ít nhất 60 giây. */
    async resend({ orderId, userId }) {
      const order = await database('orders').select('id', 'user_id', 'status', 'ticket_email_sent_at',
        database.raw(`ticket_email_sent_at > clock_timestamp() - interval '${RESEND_COOLDOWN_SECONDS} seconds' AS recent`))
        .where({ id: orderId }).first();
      if (!order) throw new TicketNotificationError('ORDER_NOT_FOUND', 404);
      if (order.user_id !== userId) throw new TicketNotificationError('ORDER_FORBIDDEN', 403);
      if (order.status !== 'paid') throw new TicketNotificationError('ORDER_NOT_PAID', 409);
      if (order.recent) throw new TicketNotificationError('EMAIL_RECENTLY_SENT', 429);
      const [claimed] = await claim({ orderId, force: true });
      if (!claimed) throw new TicketNotificationError('EMAIL_IN_PROGRESS', 409);
      if (!(await send(claimed))) throw new TicketNotificationError('EMAIL_DELIVERY_FAILED', 502);
      return { sent: true };
    },
  };
};

module.exports = { MAX_ATTEMPTS, TicketNotificationError, createTicketEmailDispatcher };
