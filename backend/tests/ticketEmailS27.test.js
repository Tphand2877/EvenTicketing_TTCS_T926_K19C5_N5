const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const db = require('../src/config/database');
const emailService = require('../src/services/emailService');
const { signTicketPayload, verifyTicketSignature } = require('../src/utils/ticketSignature');
const { generateTicketId, generateTicketQrCode } = require('../src/services/ticketService');
const { sendTicketEmailForOrder, TicketNotificationError } = require('../src/services/ticketNotificationService');

describe('SCRUM-223 [S-27] & SCRUM-35 [E-11]: Vé gửi qua email kèm mã QR', () => {
  beforeEach(() => {
    emailService.clearSentEmails();
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('1. Chữ ký mã QR bảo mật (S-26 / S-27)', () => {
    const samplePayload = {
      ticketId: 'TKT-A1B2C3D4-101',
      orderId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      showtimeId: 10,
      seatId: 101,
      seatLabel: 'A1',
    };

    it('tạo chữ ký HMAC-SHA256 hợp lệ và xác thực thành công', () => {
      const sig = signTicketPayload(samplePayload);
      expect(typeof sig).toBe('string');
      expect(sig).toHaveLength(64); // SHA-256 hex length

      const isValid = verifyTicketSignature(samplePayload, sig);
      expect(isValid).toBe(true);
    });

    it('từ chối khi chữ ký bị sửa đổi hoặc làm giả', () => {
      const sig = signTicketPayload(samplePayload);
      const fakeSig = sig.slice(0, -4) + '0000';
      expect(verifyTicketSignature(samplePayload, fakeSig)).toBe(false);
    });

    it('từ chối khi dữ liệu vé bị sửa đổi (đổi ghế, đổi suất, đổi mã vé)', () => {
      const sig = signTicketPayload(samplePayload);
      // Đổi số ghế từ A1 sang B1
      expect(verifyTicketSignature({ ...samplePayload, seatLabel: 'B1' }, sig)).toBe(false);
      // Đổi mã đơn hàng
      expect(verifyTicketSignature({ ...samplePayload, orderId: 'different-order-uuid' }, sig)).toBe(false);
      // Đổi suất diễn
      expect(verifyTicketSignature({ ...samplePayload, showtimeId: 999 }, sig)).toBe(false);
    });

    it('từ chối khi chữ ký rỗng hoặc sai kiểu dữ liệu', () => {
      expect(verifyTicketSignature(samplePayload, '')).toBe(false);
      expect(verifyTicketSignature(samplePayload, null)).toBe(false);
      expect(verifyTicketSignature(samplePayload, undefined)).toBe(false);
    });
  });

  describe('2. Sinh mã vé và QR Code (Ticket Service)', () => {
    it('sinh canonical ticket ID đúng định dạng', () => {
      const ticketId = generateTicketId('a1b2c3d4-0000-0000-0000-000000000000', 42);
      expect(ticketId).toBe('TKT-A1B2C3D4-42');
    });

    it('sinh mã QR code data URL và SVG chứa chữ ký bảo mật', async () => {
      const qrData = await generateTicketQrCode({
        ticketId: 'TKT-TEST-1',
        orderId: 'order-123',
        showtimeId: 5,
        seatId: 1,
        seatLabel: 'C10',
        categoryName: 'VIP',
        startsAt: new Date().toISOString(),
        venue: 'Nhà hát Hòa Bình',
      });

      expect(qrData.signature).toBeDefined();
      expect(qrData.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(qrData.qrCodeSvg).toContain('<svg');

      const parsedPayload = JSON.parse(qrData.qrPayload);
      expect(parsedPayload.t).toBe('TKT-TEST-1');
      expect(parsedPayload.seat).toBe('C10');
      expect(parsedPayload.cat).toBe('VIP');
      expect(parsedPayload.sig).toBe(qrData.signature);
    });
  });

  describe('3. Dịch vụ gửi email vé điện tử (Email Service)', () => {
    it('gửi email vé với đầy đủ thông tin sự kiện, ghế và mã QR', async () => {
      const mailRecord = await emailService.sendTicketEmail({
        to: 'buyer@test.com',
        buyerName: 'Nguyen Van A',
        order: { id: 'e7b8c9d0-1234-5678-90ab-cdef12345678', totalAmount: 700000 },
        event: { title: 'Đêm Nhạc Trịnh Công Sơn', venue: 'Nhà hát Lớn Hà Nội' },
        showtime: { startsAt: '2026-11-20T20:00:00.000Z' },
        tickets: [
          {
            ticketId: 'TKT-E7B8C9D0-10',
            seatLabel: 'A1',
            categoryName: 'VIP',
            unitPrice: 350000,
            qrCodeDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
          },
          {
            ticketId: 'TKT-E7B8C9D0-11',
            seatLabel: 'A2',
            categoryName: 'VIP',
            unitPrice: 350000,
            qrCodeDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
          },
        ],
      });

      expect(mailRecord.type).toBe('ticket');
      expect(mailRecord.to).toBe('buyer@test.com');
      expect(mailRecord.subject).toContain('Đêm Nhạc Trịnh Công Sơn');
      expect(mailRecord.ticketCount).toBe(2);
      expect(mailRecord.html).toContain('Đêm Nhạc Trịnh Công Sơn');
      expect(mailRecord.html).toContain('Nhà hát Lớn Hà Nội');
      expect(mailRecord.html).toContain('A1');
      expect(mailRecord.html).toContain('A2');
      expect(mailRecord.html).toContain('700.000₫');
      expect(mailRecord.html).toContain('data:image/png;base64');

      // Kiểm tra lưu trữ trong danh sách email đã gửi
      expect(emailService.getSentEmails()).toHaveLength(1);
      expect(emailService.getSentTicketEmails()).toHaveLength(1);
    });

    it('xóa danh sách email đã gửi khi gọi clearSentEmails()', async () => {
      await emailService.sendTicketEmail({
        to: 'test@test.com',
        order: { id: 'test-order' },
        event: { title: 'Test' },
        showtime: { startsAt: new Date().toISOString() },
        tickets: [],
      });
      expect(emailService.getSentTicketEmails()).toHaveLength(1);

      emailService.clearSentEmails();
      expect(emailService.getSentTicketEmails()).toHaveLength(0);
      expect(emailService.getSentEmails()).toHaveLength(0);
    });
  });

  describe('4. API Vé và Gửi lại Email Vé (/api/orders/:orderId)', () => {
    const validBuyerToken = jwt.sign(
      { userId: 3, role: 'buyer', email: 'buyer@test.com' },
      process.env.JWT_SECRET || 'dev_secret_key_eventticketing_sprint1_super_secure',
      { expiresIn: '1h' },
    );

    it('yêu cầu xác thực khi truy cập API vé (401)', async () => {
      const res = await request(app).get('/api/orders/order-uuid-1/tickets');
      expect(res.status).toBe(401);
    });

    it('yêu cầu xác thực khi gọi API gửi lại email vé (401)', async () => {
      const res = await request(app).post('/api/orders/order-uuid-1/send-ticket-email');
      expect(res.status).toBe(401);
    });

    it('trả về 404 khi không tìm thấy mã đơn hàng', async () => {
      const res = await request(app)
        .get('/api/orders/00000000-0000-0000-0000-000000000000/tickets')
        .set('Authorization', `Bearer ${validBuyerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Không tìm thấy đơn hàng');
    });

    it('trả về 404 khi gửi email cho đơn hàng không tồn tại', async () => {
      const res = await request(app)
        .post('/api/orders/00000000-0000-0000-0000-000000000000/send-ticket-email')
        .set('Authorization', `Bearer ${validBuyerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('5. Ràng buộc bảo mật và trạng thái thanh toán (Business Rules)', () => {
    it('từ chối gửi vé khi đơn hàng chưa thanh toán hoặc mã đơn không hợp lệ', async () => {
      await expect(sendTicketEmailForOrder('')).rejects.toThrow(TicketNotificationError);
      await expect(sendTicketEmailForOrder(null)).rejects.toThrow(TicketNotificationError);
    });
  });
});
