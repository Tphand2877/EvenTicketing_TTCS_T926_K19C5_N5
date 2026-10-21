/**
 * SCRUM-76 [S-03] & SCRUM-223 [S-27] - Email Service
 * - Gửi email xác thực tài khoản và liên kết kích hoạt (S-03)
 * - Gửi vé điện tử qua email kèm mã QR có chữ ký sau thanh toán (S-27 / E-11)
 */

const sentEmails = [];
const sentTicketEmails = [];

const formatVND = (value) => `${Number(value || 0).toLocaleString('vi-VN')}₫`;

const formatDateTimeVi = (dateInput) => {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${hours}:${minutes} ngày ${day}/${month}/${year}`;
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

    return mailRecord;
  },

  /**
   * Gửi vé điện tử qua email kèm mã QR (SCRUM-223 / S-27)
   * @param {Object} params
   * @param {string} params.to - Địa chỉ email người nhận
   * @param {string} [params.buyerName] - Tên người mua
   * @param {Object} params.order - Thông tin đơn hàng (id, totalAmount, currency)
   * @param {Object} params.event - Thông tin sự kiện (title, venue)
   * @param {Object} params.showtime - Thông tin suất diễn (startsAt)
   * @param {Array} params.tickets - Danh sách vé có QR code data URL
   */
  sendTicketEmail: async ({ to, buyerName = '', order, event, showtime, tickets = [] }) => {
    const shortOrderId = (order.id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
    const eventTitle = event?.title || 'Sự kiện EvenTicketing';
    const eventVenue = event?.venue || 'Chưa xác định';
    const showtimeStr = formatDateTimeVi(showtime?.startsAt || showtime?.starts_at);
    const totalAmount = order?.totalAmount || order?.total_amount || 0;

    const ticketsHtml = tickets
      .map((t, idx) => `
        <div style="border: 1px solid #E5E7EB; border-radius: 12px; padding: 16px; margin-bottom: 16px; background-color: #F9FAFB;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #D1D5DB; padding-bottom: 12px; margin-bottom: 12px;">
            <div>
              <span style="font-weight: 700; color: #4F46E5; font-size: 16px;">Vé #${idx + 1}: Ghế ${t.seatLabel || `${t.rowLabel}${t.seatNumber}`}</span>
              <div style="font-size: 13px; color: #6B7280; margin-top: 2px;">Hạng vé: <strong>${t.categoryName || 'Tiêu chuẩn'}</strong> | Mã vé: <code>${t.ticketId}</code></div>
            </div>
            <div style="font-size: 15px; font-weight: 700; color: #111827;">${formatVND(t.unitPrice)}</div>
          </div>
          <div style="text-align: center; padding: 8px 0;">
            ${t.qrCodeDataUrl ? `<img src="${t.qrCodeDataUrl}" alt="Mã QR vé ${t.ticketId}" style="width: 160px; height: 160px; border-radius: 8px; border: 1px solid #E5E7EB; display: inline-block;" />` : ''}
            <div style="font-size: 11px; color: #6B7280; margin-top: 6px; font-family: monospace;">Mã quét bảo mật: ${t.ticketId}</div>
          </div>
        </div>
      `)
      .join('');

    const html = `
      <div style="font-family: Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #111827; background: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #E5E7EB;">
        <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 32px 24px; text-align: center; color: #FFFFFF;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">🎟️ EvenTicketing</h1>
          <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">Vé điện tử xác nhận đơn hàng thành công</p>
        </div>

        <div style="padding: 24px;">
          <p style="font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">
            Xin chào <strong>${buyerName || 'Quý khách'}</strong>,<br/>
            Cảm ơn bạn đã đặt vé qua EvenTicketing! Đơn hàng <strong>#${shortOrderId}</strong> của bạn đã được thanh toán thành công. Dưới đây là thông tin vé điện tử kèm mã QR để bạn sử dụng khi đến tham dự sự kiện.
          </p>

          <div style="background-color: #EEF2FF; border-left: 4px solid #4F46E5; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px;">
            <div style="font-size: 16px; font-weight: 700; color: #3730A3;">${eventTitle}</div>
            <div style="font-size: 13px; color: #4B5563; margin-top: 4px;">📍 Địa điểm: <strong>${eventVenue}</strong></div>
            <div style="font-size: 13px; color: #4B5563; margin-top: 2px;">🕒 Thời gian: <strong>${showtimeStr}</strong></div>
            <div style="font-size: 13px; color: #4B5563; margin-top: 2px;">💳 Tổng tiền: <strong style="color: #059669;">${formatVND(totalAmount)}</strong> (Đã thanh toán)</div>
          </div>

          <h3 style="font-size: 15px; font-weight: 700; margin: 0 0 12px 0; color: #1F2937;">Danh sách vé và Mã QR kiểm soát</h3>
          ${ticketsHtml}

          <div style="background-color: #FEF3C7; border: 1px solid #FCD34D; border-radius: 8px; padding: 12px; margin-top: 20px; font-size: 12px; color: #92400E;">
            <strong>⚠️ Lưu ý kiểm soát vé tại cửa:</strong>
            <ul style="margin: 4px 0 0 0; padding-left: 18px;">
              <li>Mỗi mã QR chỉ có giá trị cho <strong>một lượt quét vào cửa duy nhất</strong>.</li>
              <li>Mã QR đã được ký số chống làm giả. Vui lòng không chia sẻ mã QR cho người khác.</li>
              <li>Bạn có thể xuất trình mã QR trực tiếp trên màn hình điện thoại hoặc in ra giấy.</li>
            </ul>
          </div>
        </div>

        <div style="background-color: #F3F4F6; padding: 16px 24px; text-align: center; font-size: 12px; color: #6B7280; border-top: 1px solid #E5E7EB;">
          Đội ngũ EvenTicketing · Hỗ trợ khách hàng: support@eventticketing.vn
        </div>
      </div>
    `;

    const mailRecord = {
      type: 'ticket',
      to,
      subject: `[EvenTicketing] Vé điện tử kèm mã QR cho sự kiện: ${eventTitle} (Đơn #${shortOrderId})`,
      buyerName,
      orderId: order.id,
      eventTitle,
      eventVenue,
      showtimeStr,
      ticketCount: tickets.length,
      tickets: tickets.map((t) => ({
        ticketId: t.ticketId,
        seatLabel: t.seatLabel,
        categoryName: t.categoryName,
        unitPrice: t.unitPrice,
        signature: t.signature,
        qrPayload: t.qrPayload,
      })),
      html,
      sentAt: new Date(),
    };

    sentEmails.push(mailRecord);
    sentTicketEmails.push(mailRecord);

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[EmailService] 🎟️ Đã gửi vé điện tử kèm mã QR tới ${to} (Đơn #${shortOrderId}, ${tickets.length} vé)`);
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
