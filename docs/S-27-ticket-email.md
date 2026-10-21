# S-27 / SCRUM-223: Vé gửi qua email kèm mã QR

Người thực hiện: Cao Long. Story phụ thuộc S-25 (bảng `tickets`) và S-26 (QR có chữ ký).

## Tiêu chí chấp nhận

| AC | Cách đáp ứng |
| --- | --- |
| Sau khi thanh toán thành công, người mua nhận email vé | Webhook commit xong thì gọi `ticketEmails.dispatchOrder(orderId)`; job `ticketEmailJob` thử lại các đơn chưa gửi được |
| Email có QR của từng vé | Mỗi vé một ảnh PNG đính kèm inline (`cid:`). Nội dung QR là `ET1.<mã vé>.<HMAC>` (S-26), giống QR trên trang "Vé của tôi" |
| Email có đủ thông tin vé | Sự kiện, địa điểm, giờ diễn (Asia/Ho_Chi_Minh), tổng tiền, ghế, hạng, giá, mã vé |
| Không gửi trùng, không gửi khi chưa thanh toán | Nhận việc bằng `UPDATE … WHERE status = 'paid' AND ticket_email_sent_at IS NULL … FOR UPDATE SKIP LOCKED` |
| Gửi lại khi cần | `POST /api/tickets/orders/:orderId/email`: chỉ chủ đơn, đơn đã thanh toán, cách nhau ≥ 60 giây |

## Luồng

1. MoMo gửi IPN. T-42 chuyển đơn sang `paid` và S-25 phát vé, trong cùng một transaction với biên nhận S-20.
2. Transaction commit, webhook trả `200`.
3. `dispatchOrder` nhận việc: `ticket_email_claimed_at = now()`, `ticket_email_attempts + 1`.
4. Dựng QR PNG cho từng vé rồi gửi qua SMTP.
5. Thành công thì đặt `ticket_email_sent_at`. Lỗi thì nhả việc để job thử lại, tối đa 5 lần.
   Nếu server chết giữa chừng thì sau 5 phút việc tự hết hạn và được nhận lại.

## Cấu hình

| Biến | Ý nghĩa |
| --- | --- |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Máy chủ SMTP. Không đặt `SMTP_HOST` thì chỉ ghi log, không gửi thật |
| `SMTP_USER`, `SMTP_PASSWORD` | Tài khoản SMTP (Gmail: App Password) |
| `MAIL_FROM` | Người gửi, ví dụ `EvenTicketing <ve@ten-mien.vn>` |
| `TICKET_EMAIL_INTERVAL_MS` | Chu kỳ job gửi lại, mặc định 60000 |
| `APP_TIMEZONE` | Múi giờ hiển thị trong email, mặc định `Asia/Ho_Chi_Minh` |

## Đã kiểm chứng

- `tests/ticketEmail.integration.test.js`: 6 ca trên PostgreSQL thật với webhook MoMo ký thật.
- Chạy thật với một SMTP sink cục bộ:
  - Email tới `buyer@test.com`, có 2 ảnh `ve-XXXX.png`. Quét 2 ảnh ra đúng 2 mã vé trong bảng `tickets`, chữ ký hợp lệ.
  - Tắt SMTP rồi thanh toán: đơn vẫn `paid`. Bật SMTP lại thì job gửi được ở lần thử thứ 3.
