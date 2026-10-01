/**
 * SCRUM-76 [S-03] - Email Service
 * Gửi email xác thực tài khoản và liên kết kích hoạt
 */

const sentEmails = [];

const emailService = {
  /**
   * Tạo đường dẫn kích hoạt
   */
  getVerificationUrl: (token) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    return `${frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
  },

  /**
   * Gửi email kích hoạt tài khoản
   * @param {string} email
   * @param {string} token
   * @param {string} [fullName]
   */
  sendActivationEmail: async (email, token, fullName = '') => {
    const verificationUrl = emailService.getVerificationUrl(token);
    const mailRecord = {
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
   * Lấy danh sách email đã gửi (dành cho kiểm thử)
   */
  getSentEmails: () => [...sentEmails],

  /**
   * Xóa lịch sử gửi email (dành cho kiểm thử)
   */
  clearSentEmails: () => {
    sentEmails.length = 0;
  },
};

module.exports = emailService;
