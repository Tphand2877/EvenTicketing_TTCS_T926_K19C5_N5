/**
 * S-27: trạng thái gửi email vé của đơn đã thanh toán.
 * Email được gửi SAU khi thanh toán commit; job thử lại các đơn chưa gửi được (SMTP lỗi, server khởi động lại).
 */
exports.up = async (knex) => {
  await knex.schema.alterTable('orders', (table) => {
    table.timestamp('ticket_email_sent_at', { useTz: true }).nullable();
    table.timestamp('ticket_email_claimed_at', { useTz: true }).nullable();
    table.integer('ticket_email_attempts').notNullable().defaultTo(0);
  });
  await knex.raw("CREATE INDEX orders_ticket_email_pending ON orders (updated_at) WHERE status = 'paid' AND ticket_email_sent_at IS NULL");
  // Đơn đã thanh toán trước S-27 không gửi lại email hàng loạt khi nâng cấp
  await knex('orders').where({ status: 'paid' }).update({ ticket_email_sent_at: knex.fn.now() });
};

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS orders_ticket_email_pending');
  await knex.schema.alterTable('orders', (table) => {
    table.dropColumn('ticket_email_sent_at');
    table.dropColumn('ticket_email_claimed_at');
    table.dropColumn('ticket_email_attempts');
  });
};
