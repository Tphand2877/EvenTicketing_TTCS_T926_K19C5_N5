# S-31 / SCRUM-225 — Minh Quang: mỗi vé một lần vào

Jira: https://eventticketing.atlassian.net/browse/SCRUM-225

## Trạng thái và phạm vi

Đây là backend ledger/service của S-31, tách từ `main`, mở PR trực tiếp vào `main`. Không có API soát vé thật trong repo
ở thời điểm bắt đầu. Phần này **chưa được nối vào HTTP/màn hình quét**, không phát hành vé,
không tạo/kiểm chữ ký QR và không triển khai tài khoản/quyền nhân viên của S-25/S-26/S-28/S-30.
Không đánh dấu toàn bộ S-31 Done trước khi nối adapter thật, review và nghiệm thu staging.
Không có gateway, schema vé giả hay API chấp nhận một ticket ID do trình duyệt tự khai.

## Phần S-31 đã triển khai

- `ticket_checkins.ticket_id` là primary key: mỗi canonical ticket ID chỉ có một lượt vào thường.
  Hai worker cùng INSERT: một worker thắng; worker còn lại đọc bản ghi đã commit, trả
  `accepted: false`, `code: ALREADY_CHECKED_IN` và `firstAdmission.gate/checkedInAt`.
- Lần vào đầu giữ nguyên qua mọi lần quét lại và các lần cho vào có ghi chú.
- `admitWithNote` chỉ chạy sau xác thực quyền override của máy chủ, bắt buộc lý do và UUID
  `requestId` cho một lần xác nhận. Lưu vào `ticket_checkin_overrides`: cửa, thời gian DB,
  lý do, user ID và tên nhân viên đọc từ bảng `users`; không tin tên/thời điểm do browser gửi.
- Unique `(ticket_id, request_id)` chống ghi lại cùng một yêu cầu override. Retry cùng nội dung
  trả `accepted: false`, `code: OVERRIDE_ALREADY_RECORDED`, `replayed: true` cùng bản ghi cũ;
  giao diện không bật tín hiệu cho vào thêm lần nữa. Đổi nội dung của cùng request ID bị từ chối.
  Một xác nhận riêng phải có request ID mới và được ghi thành một lượt vào riêng.
- Không có log QR, tên nhân viên, lý do hoặc dữ liệu người mua. Lỗi có code/status; handler S-30
  phải ánh xạ lỗi sang thông báo cố định, không log đối tượng lỗi SQL/param hoặc toàn bộ input.

## Hợp đồng đề xuất để S-30 nối vào

`createTicketAdmissionService({ access })` bắt buộc có `access.withAuthorizedTicket`.
Không có adapter mặc định cho phép vào. Đây là điểm nối cần thống nhất với người làm S-30,
không phải lời khẳng định API S-30 đã có. Adapter phải:

1. Xác thực QR/chữ ký/key version theo S-26 và tra vé thật của S-25; lấy **canonical ticket ID**
   từ nguồn vé, không dùng raw QR/chữ ký làm khoá chống trùng (QR khác vẫn có thể là cùng vé).
2. Kiểm tra vé có hiệu lực, thuộc đơn đã trả và đúng suất; kiểm tra nhân viên còn hoạt động,
   được phân công đúng suất/cửa. Quyền `canOverride` là quyết định ở server, không lấy từ body/JWT
   tuỳ ý do client tự khai. `actorId` đầu vào phải lấy từ phiên đăng nhập đã xác thực.
3. Mở transaction Knex PostgreSQL READ COMMITTED, khoá chia sẻ vé và các hàng cấp quyền cần thiết
   để huỷ vé/thu hồi quyền không chạy chen giữa lúc kiểm tra và ghi lượt vào.
4. Gọi callback với context bên dưới và trả kết quả callback **sau khi transaction commit**.
   Không gửi HTTP/hiển thị xanh trước commit. Lỗi phải rollback. Nếu dùng isolation cao hơn,
   S-30 phải retry toàn bộ transaction khi gặp lỗi serialization, không được báo vào thành công.

```js
const { createTicketAdmissionService } = require('../services/ticketAdmissionService');
const admission = createTicketAdmissionService({
  access: {
    async withAuthorizedTicket(input, operation) {
      // S-30: QR verification + real ticket/permission lookup/locking inside one transaction.
      // input: { qrCode, actorId, showtimeId, gate, permission: 'scan' | 'override' }
      // Return await db.transaction(async transaction => operation({
      //   transaction,
      //   ticket: { id: canonicalTicketId, showtimeId: persistedShowtimeId },
      //   staff: { id: authenticatedStaffId, canScan: true, canOverride: permissionFromServer },
      // }));
      throw new Error('Wire the real S-30 adapter here.');
    },
  },
});
// S-30's authenticated route calls admission.admit(...) or admission.admitWithNote(...).
```

Ví dụ trên chỉ mô tả interface; không mount vào `app.js` và không thay được adapter thật.
Các trường đầu vào chung: `qrCode` (chuỗi), `actorId`/`showtimeId` (integer), `gate` (1–100 ký tự).
Override thêm `reason` (1–500 ký tự sau trim) và `requestId` (UUID). Browser giữ nguyên request ID
khi retry một lần xác nhận; tạo ID mới chỉ khi nhân viên xác nhận một lần vào riêng.

Các mã đặc biệt: `ALREADY_CHECKED_IN`, `OVERRIDE_ALREADY_RECORDED`, `INVALID_SCAN_CONTEXT`,
`INVALID_OVERRIDE`, `OVERRIDE_FORBIDDEN`, `STAFF_NOT_ACTIVE`, `STAFF_NAME_REQUIRED`,
`TICKET_NOT_CHECKED_IN`, `OVERRIDE_REQUEST_CONFLICT`, `TICKET_CONTEXT_MISMATCH`.
Các lỗi từ verifier/ticket/grant của S-30 phải giữ tính từ chối; không fallback thành thành công.

Migration chỉ tạo ledger. `ticket_id` là chuỗi opaque tối đa 200 ký tự để không tự đặt schema vé
cho đồng đội. FK đến bảng vé phải được thống nhất với S-25 khi schema đó có thật. Các FK tới
showtimes/users và lượt vào đầu đã được bảo vệ; xoá showtime/user có lịch sử sẽ bị chặn để giữ audit.

## Kiểm chứng

```sh
cd backend
npm run lint
npm run build
npm test -- --runInBand --coverage=false tests/ticketAdmissionService.test.js
# Cấu hình DB_HOST/DB_PORT/DB_USER/DB_PASSWORD tới PostgreSQL kiểm thử.
# Tạo database riêng eventticketing_s31_test; khác database DB_NAME hiện tại.
TICKET_ADMISSION_DB_NAME_TEST=eventticketing_s31_test RUN_TICKET_ADMISSION_DB_TESTS=1 \
  npm test -- --runInBand --coverage=false tests/ticketAdmission.integration.test.js
```

CI tự tạo database riêng và bật `RUN_TICKET_ADMISSION_DB_TESTS=1`. Không truy cập được DB là fail,
không bỏ qua. Mỗi lần chạy tạo schema riêng rồi xoá. Bộ DB test dùng ticket/grant **fixture** để
kiểm chứng ledger thật, không chứng minh chữ ký QR thật hoặc toàn bộ luồng S-30 đã hoạt động.

- Quét lại ở cửa B nhận đúng cửa A/thời điểm trước và không sửa bản ghi đầu.
- 20 lượt quét qua hai pool/worker: 1 chấp nhận, 19 trùng; INSERT trực tiếp lần hai bị DB từ chối.
- Override ghi lý do và tên DB, không tin tên browser; không sửa lượt đầu.
- 20 retry override: 1 lượt mới, 19 ACK bản cũ; đổi nội dung cùng ID bị chặn.
- Hai xác nhận riêng tạo hai audit, vẫn giữ lượt vào đầu.
- Thiếu lý do/quyền/tên nhân viên, nhân viên ngừng hoạt động, vé không hợp lệ/sai suất/cửa đều không tạo lượt vào.
- Lỗi sau INSERT rollback cả transaction; service/kết nối mới vẫn nhớ vé đã vào; migration down/up độc lập.

Trước khi Done: adapter S-25/S-26/S-28/S-30 thật được nối, test HTTP bằng QR thật và phân quyền thật,
AC pass staging, một đồng đội duyệt, CI và quét phụ thuộc đạt. Cập nhật nhánh từ `main` và kiểm tra
lại diff/CI khi các PR phụ thuộc được merge.
