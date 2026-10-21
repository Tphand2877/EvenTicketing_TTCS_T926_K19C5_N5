const { signTicketCode, verifyTicketCode } = require('../src/utils/ticketQr');

const ENV = { TICKET_QR_SECRET: 's26-ticket-qr-secret-for-tests-only-0001' };
const TICKET = '4f1c2d3e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

describe('S-26: QR trên vé có chữ ký, không làm giả được ngoài hệ thống', () => {
  test('QR do hệ thống ký được chấp nhận và trả đúng mã vé', () => {
    const code = signTicketCode(TICKET, ENV);
    expect(code).toMatch(/^ET1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    expect(verifyTicketCode(code, ENV)).toEqual({ valid: true, ticketId: TICKET });
  });

  test('QR không chứa thông tin cá nhân hay giá vé, chỉ phiên bản + mã vé + chữ ký', () => {
    expect(signTicketCode(TICKET, ENV).split('.')).toHaveLength(3);
  });

  test('đổi mã vé sang vé khác nhưng giữ chữ ký cũ -> BAD_SIGNATURE', () => {
    const [, , signature] = signTicketCode(TICKET, ENV).split('.');
    const other = '4f1c2d3e-5a6b-4c7d-8e9f-0a1b2c3d4e60';
    expect(verifyTicketCode(`ET1.${other}.${signature}`, ENV)).toEqual({ valid: false, reason: 'BAD_SIGNATURE' });
  });

  test('chữ ký tạo bằng khoá khác (ngoài hệ thống) -> BAD_SIGNATURE', () => {
    const forged = signTicketCode(TICKET, { TICKET_QR_SECRET: 'attacker-guessed-secret-of-32-chars!!' });
    expect(verifyTicketCode(forged, ENV)).toEqual({ valid: false, reason: 'BAD_SIGNATURE' });
  });

  test('sửa 1 ký tự chữ ký -> BAD_SIGNATURE', () => {
    const code = signTicketCode(TICKET, ENV);
    const last = code.at(-1) === 'A' ? 'B' : 'A';
    expect(verifyTicketCode(code.slice(0, -1) + last, ENV).valid).toBe(false);
  });

  test.each([
    ['rỗng', ''],
    ['không phải chuỗi', 123],
    ['thiếu chữ ký', `ET1.${TICKET}`],
    ['mã vé không phải UUID', 'ET1.1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    ['quá dài', `ET1.${TICKET}.${'A'.repeat(300)}`],
  ])('QR sai định dạng (%s) -> MALFORMED', (_name, code) => {
    expect(verifyTicketCode(code, ENV)).toEqual({ valid: false, reason: 'MALFORMED' });
  });

  test('phiên bản lạ -> UNSUPPORTED_VERSION', () => {
    const code = signTicketCode(TICKET, ENV).replace(/^ET1/, 'ET9');
    expect(verifyTicketCode(code, ENV)).toEqual({ valid: false, reason: 'UNSUPPORTED_VERSION' });
  });

  test('không có khoá nào -> từ chối ký, không dùng khoá mặc định', () => {
    expect(() => signTicketCode(TICKET, {})).toThrow(expect.objectContaining({ code: 'TICKET_QR_NOT_CONFIGURED' }));
    expect(() => signTicketCode(TICKET, { TICKET_QR_SECRET: 'short' })).toThrow(expect.objectContaining({ code: 'TICKET_QR_NOT_CONFIGURED' }));
  });

  test('chỉ có JWT_SECRET: dùng khoá dẫn xuất riêng, khác môi trường thì QR không dùng chéo được', () => {
    const a = signTicketCode(TICKET, { JWT_SECRET: 'env-a' });
    expect(verifyTicketCode(a, { JWT_SECRET: 'env-a' }).valid).toBe(true);
    expect(verifyTicketCode(a, { JWT_SECRET: 'env-b' }).valid).toBe(false);
  });
});
