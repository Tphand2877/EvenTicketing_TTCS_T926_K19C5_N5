# Bán vé sự kiện có sơ đồ ghế

Cấu trúc thư mục khởi tạo cho dự án (Frontend + Backend), map theo backlog Jira (SCRUM).
Toàn bộ file trong cây bên dưới hiện đang **rỗng** — dùng làm khung để cả team điền code vào theo đúng task được giao.

## Sơ đồ cây thư mục

```
event-ticketing-seatmap/
├── README.md                                  # File này
├── docker-compose.yml                         # Compose chạy FE + BE (+DB) cùng lúc (SCRUM-67 → SCRUM-71)
├── .github/
│   └── workflows/
│       └── ci.yml                             # Pipeline CI: build, lint, test (SCRUM-67 → SCRUM-70)
│
├── frontend/
│   ├── Dockerfile                             # Build image FE để deploy staging (SCRUM-67 → SCRUM-71)
│   ├── package.json
│   └── src/
│       ├── App.jsx                            # Root component, khai báo router (SCRUM-67 → SCRUM-69)
│       ├── main.jsx                           # Entry point (SCRUM-67 → SCRUM-69)
│       ├── components/                        # UI components tái sử dụng
│       │   ├── common/                        # Header, Footer, Modal, Button (nền tảng - SCRUM-67 → SCRUM-69)
│       │   │   ├── Header.jsx
│       │   │   ├── Footer.jsx
│       │   │   ├── Modal.jsx
│       │   │   └── Button.jsx
│       │   ├── auth/                          # Form Đăng ký, Đăng nhập (S-02, S-03)
│       │   │   ├── LoginForm.jsx               # Đăng nhập bằng email/mật khẩu (SCRUM-72)
│       │   │   ├── RegisterForm.jsx            # Form đăng ký người mua (SCRUM-76)
│       │   │   └── VerifyEmailNotice.jsx       # Thông báo chờ xác nhận email (SCRUM-76)
│       │   ├── seatmap/                        # Component vẽ & chọn sơ đồ ghế (E-04, chưa vào sprint hiện tại)
│       │   │   ├── SeatMapCanvas.jsx           # Vẽ sơ đồ ghế + xử lý chọn ghế
│       │   │   ├── SeatLegend.jsx              # Chú giải trạng thái ghế (trống/giữ/đã bán)
│       │   │   └── SeatHoldTimer.jsx           # Đếm ngược thời hạn giữ chỗ, dựa trên kết quả spike (SCRUM-84)
│       │   └── event/                          # Event Card, Event Detail, danh sách cho buyer (S-04)
│       │       ├── EventCard.jsx               # (SCRUM-80)
│       │       ├── EventDetail.jsx             # (SCRUM-80)
│       │       ├── ShowtimeList.jsx            # (SCRUM-80)
│       │       ├── EventListView.jsx           # Buyer xem danh sách event đã tạo — bổ sung để khép kín demo (SCRUM-80)
│       │       └── eventFormat.js              # Hàm định dạng giá, ngày, danh mục dùng chung (SCRUM-80)
│       ├── pages/                              # Các trang / route chính
│       │   ├── LoginPage.jsx                   # (SCRUM-72)
│       │   ├── RegisterPage.jsx                # (SCRUM-76)
│       │   ├── EventListPage.jsx               # (SCRUM-80)
│       │   ├── EventDetailPage.jsx             # (SCRUM-80, giữ chỗ SCRUM-84)
│       │   ├── OrganizerDashboardPage.jsx      # Organizer tạo/sửa/xóa event & suất diễn (SCRUM-80)
│       │   └── CheckoutPage.jsx                # Placeholder cho E-05 Payments & Orders (chưa vào sprint hiện tại)
│       ├── routes/
│       │   └── PrivateRoute.jsx                # Chặn route theo vai trò ở phía FE (thuộc S-02)
│       └── services/                           # Gọi API backend
│           ├── apiClient.js                    # Cấu hình axios/fetch chung (SCRUM-67 → SCRUM-69)
│           ├── authService.js                  # (SCRUM-72, SCRUM-76)
│           └── eventService.js                 # (SCRUM-80)
│
└── backend/
    ├── Dockerfile                              # Build image BE để deploy staging (SCRUM-67 → SCRUM-71)
    ├── package.json
    └── src/
        ├── app.js                              # Khởi tạo Express app, gắn middleware/route (SCRUM-67 → SCRUM-69)
        ├── config/
        │   └── database.js                     # Kết nối DB (SCRUM-67 → SCRUM-69)
        ├── migrations/
        │   ├── 001_create_users_and_roles.js   # Bảng users, roles (thuộc S-02)
        │   ├── 002_create_events_and_showtimes.js # Placeholder rỗng (giữ nguyên vì có thể đã chạy ở các môi trường)
        │   └── 005_create_events_and_showtimes.js # Bảng events, showtimes thật (SCRUM-80)
        ├── models/
        │   ├── User.js
        │   ├── Role.js
        │   ├── Event.js
        │   └── Showtime.js
        ├── controllers/
        │   ├── authController.js               # Đăng ký + đăng nhập (SCRUM-72, SCRUM-76)
        │   └── eventController.js               # CRUD sự kiện & suất diễn + API cho buyer xem list (SCRUM-80)
        ├── middleware/
        │   ├── authMiddleware.js                # Xác thực token/session (thuộc S-02)
        │   └── roleMiddleware.js                # Chặn truy cập theo vai trò cơ bản (thuộc S-02)
        ├── routes/
        │   ├── authRoutes.js
        │   └── eventRoutes.js
        ├── services/
        │   ├── emailService.js                  # Gửi/log email xác nhận tài khoản (thuộc S-03, SCRUM-76)
        │   └── seatHoldService.js               # Cơ chế giữ chỗ có thời hạn, theo kết quả spike (SCRUM-84)
        └── tests/
```

## Ghi chú
- `SCRUM-67 → SCRUM-69/70/71` nghĩa là các file đó thuộc story cha SCRUM-67, được hoàn thành thông qua các sub-task 69/70/71 — không phải một phần code tách riêng.
- Sprint 1 hiện tại (24–28/9) gồm SCRUM-67, 72, 76, 80 (+ SCRUM-84 spike, SCRUM-85 định nghĩa WBS) — các file được đánh dấu tương ứng ở trên là phần cần hoàn thành để đạt Sprint Goal và có demo.
- `EventListView.jsx` và API xem danh sách event trong `eventController.js` là phần **bổ sung** để buyer thấy được sự kiện organizer vừa tạo, khép kín vòng lặp demo — chưa phải ticket chính thức trên board, nên tạo ticket con nếu muốn track riêng.
- `seatmap/`, `CheckoutPage.jsx` thuộc các epic (E-04, E-05) chưa nằm trong sprint hiện tại — giữ chỗ sẵn trong cây, chưa cần code.
