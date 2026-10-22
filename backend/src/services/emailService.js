/**
 * SCRUM-76 [S-03] & SCRUM-223 [S-27] - Email Service
 * - Gửi email xác thực tài khoản và liên kết kích hoạt (S-03)
 * - Gửi vé điện tử qua email kèm mã QR có chữ ký sau thanh toán (S-27)
 *
 * Có SMTP_HOST thì gửi thật qua SMTP (nodemailer). Không có thì chỉ ghi nhận + log (môi trường dev/test).
 */
const nodemailer = require('nodemailer');

const sentEmails = [];
const sentTicketEmails = [];
let transport;

const getTransport = (env = process.env) => {
  if (!env.SMTP_HOST) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT) || 587,
      secure: env.SMTP_SECURE === 'true',
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }
  return transport;
};

const deliver = async (message) => {
  const smtp = getTransport();
  if (!smtp) return { transport: 'log' };
  await smtp.sendMail({ from: process.env.MAIL_FROM || 'EvenTicketing <no-reply@eventticketing.local>', ...message });
  return { transport: 'smtp' };
};

// Tên sự kiện/người mua do người dùng nhập: luôn escape trước khi chèn vào HTML
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const formatVND = (value) => `${Number(value || 0).toLocaleString('vi-VN')}₫`;
const formatDateTimeVi = (value) => (value
  ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'full', timeStyle: 'short', timeZone: process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh' })
    .format(new Date(value))
  : '');

/** HTML email vé. Ảnh QR là ảnh đính kèm inline (cid:), vì Gmail/Outlook chặn ảnh data: URL. */
const renderTicketEmail = ({ buyerName, order, tickets }) => {
  const first = tickets[0];
  const shortOrderId = order.id.replace(/-/g, '').slice(0, 8).toUpperCase();
  const rows = tickets.map((t, i) => `
    <tr><td style="padding:16px;border:1px solid #E5E7EB;border-radius:12px;">
      <div style="font-weight:700;color:#4F46E5;font-size:16px;">Vé ${i + 1}: Ghế ${escapeHtml(t.seat.label)}</div>
      <div style="font-size:13px;color:#6B7280;margin:4px 0 8px;">Hạng ${escapeHtml(t.category)} · ${formatVND(t.price)} · Mã vé ${escapeHtml(t.code)}</div>
      <img src="cid:${t.cid}" alt="Mã QR vé ${escapeHtml(t.code)}" width="200" height="200" style="display:block;" />
    </td></tr>`).join('');
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
      <h1 style="font-size:22px;margin:0 0 12px;">🎟️ EvenTicketing</h1>
      <p>Xin chào <strong>${escapeHtml(buyerName || 'Quý khách')}</strong>,</p>
      <p>Đơn hàng <strong>#${shortOrderId}</strong> đã được thanh toán. Dưới đây là vé điện tử của bạn, mỗi vé một mã QR.</p>
      <div style="background:#EEF2FF;border-left:4px solid #4F46E5;padding:12px 16px;margin:16px 0;">
        <div style="font-size:16px;font-weight:700;">${escapeHtml(first.event.title)}</div>
        <div style="font-size:13px;">📍 ${escapeHtml(first.event.venue)}</div>
        <div style="font-size:13px;">🕒 ${escapeHtml(formatDateTimeVi(first.showtime.startsAt))}</div>
        <div style="font-size:13px;">💳 Tổng tiền: ${formatVND(order.total_amount)}</div>
      </div>
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:separate;border-spacing:0 12px;">${rows}</table>
      <p style="font-size:12px;color:#92400E;background:#FEF3C7;padding:12px;border-radius:8px;">
        Mỗi mã QR chỉ dùng được cho một lượt vào. Mã QR có chữ ký của hệ thống, không chia sẻ cho người khác.
        Bạn cũng xem được vé trong mục "Vé của tôi" trên website.
      </p>
    </div>`;
  const text = [
    `Xin chào ${buyerName || 'Quý khách'},`,
    `Đơn hàng #${shortOrderId} đã được thanh toán.`,
    `${first.event.title} - ${first.event.venue} - ${formatDateTimeVi(first.showtime.startsAt)}`,
    ...tickets.map((t, i) => `Vé ${i + 1}: ghế ${t.seat.label}, hạng ${t.category}, mã vé ${t.code}`),
    'Mã QR của từng vé nằm trong email (bản HTML) và trong mục "Vé của tôi".',
  ].join('\n');
  return { html, text, subject: `[EvenTicketing] Vé điện tử: ${first.event.title} (Đơn #${shortOrderId})` };
};

const emailService = {
  /**
   * Tạo đường dẫn kích hoạt
   */
  getVerificationUrl: (token) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    return `${frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
  },

  /**
   * Gửi email kích hoạt tài khoản (S-03)
   */
  sendActivationEmail: async (email, token, fullName = '') => {
    const verificationUrl = emailService.getVerificationUrl(token);
    const mailRecord = {
      type: 'activation',
      to: email,
      subject: 'Xác nhận đăng ký tài khoản EvenTicketing',
      fullName,
      token,
      verificationUrl,
      sentAt: new Date(),
    };

    sentEmails.push(mailRecord);

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[EmailService] 📧 Đã gửi email kích hoạt tới ${email}`);
      console.log(`[EmailService] 🔗 Liên kết kích hoạt: ${verificationUrl}`);
    }
    try {
      await deliver({ to: email, subject: mailRecord.subject,
        text: `Xin chào ${fullName || ''}, mở liên kết sau để kích hoạt tài khoản: ${verificationUrl}` });
    } catch {
      // Đăng ký không thất bại vì SMTP; người dùng có thể yêu cầu gửi lại liên kết
      console.error('[EmailService] Activation email delivery failed.');
    }

    return mailRecord;
  },

  /**
   * S-27: gửi vé điện tử kèm QR. tickets là vé đã phát (S-25), mỗi vé có qrCode đã ký (S-26)
   * và qrPng (Buffer). Lỗi SMTP được ném ra để bộ gửi thử lại sau.
   */
  sendTicketEmail: async ({ to, buyerName = '', order, tickets }) => {
    if (!to || !Array.isArray(tickets) || tickets.length === 0) throw new Error('Ticket email needs a recipient and tickets.');
    const withCid = tickets.map((t) => ({ ...t, cid: `ticket-${t.id}@eventticketing` }));
    const { html, text, subject } = renderTicketEmail({ buyerName, order, tickets: withCid });
    const attachments = withCid.map((t) => ({ filename: `ve-${t.code}.png`, content: t.qrPng, contentType: 'image/png', cid: t.cid }));
    const { transport: via } = await deliver({ to, subject, html, text, attachments });

    const mailRecord = {
      type: 'ticket',
      to,
      subject,
      orderId: order.id,
      ticketCount: tickets.length,
      tickets: withCid.map((t) => ({ id: t.id, seat: t.seat.label, qrCode: t.qrCode, cid: t.cid })),
      attachments: attachments.map(({ filename, cid, content }) => ({ filename, cid, bytes: content.length })),
      html,
      transport: via,
      sentAt: new Date(),
    };
    sentEmails.push(mailRecord);
    sentTicketEmails.push(mailRecord);
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[EmailService] 🎟️ Đã gửi ${tickets.length} vé (${via}).`);
    }
    return mailRecord;
  },

  /**
   * Lấy danh sách email đã gửi (dành cho kiểm thử)
   */
  getSentEmails: () => [...sentEmails],

  /**
   * Lấy danh sách email vé điện tử đã gửi (dành cho kiểm thử S-27)
   */
  getSentTicketEmails: () => [...sentTicketEmails],

  /**
   * Xóa lịch sử gửi email (dành cho kiểm thử)
   */
  clearSentEmails: () => {
    sentEmails.length = 0;
    sentTicketEmails.length = 0;
  },
};

module.exports = emailService;
module.exports.escapeHtml = escapeHtml;
