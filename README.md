# EvenTicketing - Hệ thống Bán Vé Sự Kiện Trực Tuyến & Sơ Đồ Ghế

> **Dự án thực tập chuyên sâu:** `EvenTicketing_TTCS_T926_K19C5_N5`  
> **Kiến trúc:** Monorepo (React 18 + Vite 5 Frontend | Express.js + Knex.js Backend | PostgreSQL 16 | Docker Compose)  
> **Trạng thái kiểm thử:** 13/13 Test Suites Passed (75/75 Tests Passed, Coverage ~85%) | ESLint 0 Errors / 0 Warnings

---

## 📌 1. Giới thiệu tổng quan

**EvenTicketing** là nền tảng quản lý và đặt vé sự kiện trực tuyến theo thời gian thực. Hệ thống hỗ trợ người mua vé xem sự kiện, chọn chỗ ngồi trên sơ đồ ghế tương tác trực quan (Seat Map Canvas), giữ chỗ tạm thời trong 10 phút để thanh toán, cùng hệ thống quản trị phân quyền đa cấp bậc (Admin, Organizer, Buyer) đáp ứng các tiêu chuẩn bảo mật khắt khe.

### ✨ Các tính năng cốt lõi (Sprint 1)
1. **Xác thực & Phân quyền bảo mật cao (SCRUM-72):**
   - Đăng nhập bảo mật với mã hóa mật khẩu thế hệ mới **Argon2id** (kháng GPU/ASIC attack).
   - Xác thực người dùng qua **JSON Web Token (JWT)**, tự động kiểm tra token hợp lệ với endpoint `/api/auth/me`.
   - Phân quyền theo vai trò (**RBAC**): `admin`, `organizer`, `buyer`.
   - Phòng chống tấn công dò mật khẩu (Brute-force): Giới hạn IP Rate Limiting và tự động khóa tài khoản tạm thời 15 phút sau 5 lần đăng nhập thất bại liên tiếp.
   - **Audit Logging**: Tự động ghi vết tất cả truy cập trái phép hoặc bị từ chối (HTTP 401/403) vào bảng `audit_logs`.
2. **Đăng ký tài khoản & Kích hoạt Email an toàn (SCRUM-76):**
   - Đăng ký tài khoản Người mua (Buyer) với mật khẩu chuẩn bảo mật cao.
   - Sinh mã kích hoạt an toàan (Activation Token có hạn 24 giờ, băm SHA-256 lưu DB).
   - Kích hoạt tài khoản qua đường dẫn email trước khi cho phép đăng nhập.
3. **Danh mục sự kiện & Sơ đồ ghế tương tác (SCRUM-80 & SCRUM-84):**
   - Xem danh sách sự kiện kèm bộ lọc thể loại (Âm nhạc, Thể thao, Hội thảo, v.v.).
   - Xem chi tiết sự kiện và danh sách các suất diễn (Showtimes).
   - Giao diện sơ đồ ghế tương tác (Canvas / SVG) hiển thị trạng thái ghế: *Trống, Đang giữ, Đã bán*.
   - Cơ chế **Seat Hold** (Giữ chỗ tạm thời 10 phút) có đồng hồ đếm ngược, tự động giải phóng ghế nếu quá hạn.
4. **Hạ tầng & Triển khai DevOps (Staging & CI/CD):**
   - Pipeline GitHub Actions CI tự động Lint, Test, Build cả Frontend & Backend.
   - Đóng gói Docker đa tầng (Multi-stage build) kết hợp Nginx reverse proxy đồng bộ port và định tuyến API `/api/`.
   - Script tự động hóa triển khai Staging (`deploy-staging.ps1`) hỗ trợ kiểm thử candidate image, health check và cơ chế Rollback an toàn.

---

## 🛠️ 2. Công nghệ sử dụng (Tech Stack)

| Phân hệ | Công nghệ | Chi tiết |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite 5, Tailwind CSS | Single Page Application (SPA), React Router DOM v6, Axios, Lucide Icons |
| **Backend** | Node.js (v18 - v22), Express.js | RESTful API, Knex.js (SQL Query Builder & Migration engine) |
| **Database** | PostgreSQL 16+ | Cơ sở dữ liệu quan hệ, UUID, Transaction, Sequence |
| **Bảo mật** | Argon2id, JWT, express-rate-limit | Tiêu chuẩn OWASP, băm mật khẩu bộ nhớ động, chống brute-force |
| **Kiểm thử** | Jest, Supertest | 13 test suites, 75 test cases, kiểm thử tích hợp DB & API Mocking |
| **DevOps** | Docker, Docker Compose, Nginx | Multi-stage build, Reverse Proxy, GitHub Actions CI/CD |

---

## 📂 3. Cấu trúc thư mục

```text
EvenTicketing_TTCS_T926_K19C5_N5/
├── .github/workflows/
│   └── ci.yml                         # GitHub Actions CI: Test, Lint & Build
├── backend/
│   ├── src/
│   │   ├── config/                    # Cấu hình Database & Security parameters
│   │   ├── controllers/               # Xử lý logic API (authController, eventController)
│   │   ├── middleware/                # Middleware: auth, role, ipRateLimiter, auditLogger
│   │   ├── migrations/                # Knex database migrations
│   │   ├── models/                    # Model truy vấn dữ liệu (User, Role, Event, Showtime, ...)
│   │   ├── routes/                    # API Endpoints (/api/auth, /api/events, /api/showtimes)
│   │   ├── services/                  # Business logic (seatHoldService, emailService)
│   │   ├── utils/                     # Tiện ích băm mật khẩu (Argon2id), activation token
│   │   └── app.js                     # Express app setup & export
│   ├── scripts/
│   │   ├── create-test-users.js       # Script nạp tài khoản mẫu cho dev
│   │   └── seed-demo-events.js        # Script nạp danh sách sự kiện & suất diễn mẫu
│   ├── seeds/
│   │   └── 01_roles.js                # Seed dữ liệu vai trò chuẩn (admin, organizer, buyer)
│   ├── tests/                         # Bộ 13 test suites kiểm thử tự động
│   ├── Dockerfile                     # Dockerfile backend
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/                # UI Components (auth, common, event, seatmap)
│   │   ├── context/                   # AuthContext (quản lý phiên đăng nhập & sync token)
│   │   ├── pages/                     # Trang (HomePage, LoginPage, RegisterPage, EventListPage, ...)
│   │   ├── routes/                    # Quản lý định tuyến và route bảo vệ (RoleProtectedRoute)
│   │   ├── services/                  # HTTP Client kết nối API (apiClient, authService, eventService)
│   │   └── App.jsx
│   ├── Dockerfile                     # Multi-stage build đóng gói React app với Nginx Alpine
│   ├── nginx.conf                     # Cấu hình Nginx reverse proxy định tuyến /api sang backend
│   └── package.json
├── scripts/
│   └── deploy-staging.ps1             # Script PowerShell deploy Staging kèm Healthcheck & Rollback
├── docker-compose.yml                 # Cấu hình Docker Compose cho môi trường phát triển & demo
├── docker-compose.staging.yml         # Cấu hình Docker Compose cho môi trường Staging
├── .env.example                       # Biến môi trường mẫu cho Docker Compose
└── README.md                          # Tài liệu dự án
```

---

## 🚀 4. Hướng dẫn cài đặt và Khởi chạy

Bạn có thể lựa chọn 1 trong 2 cách khởi chạy dưới đây:

### Cách 1: Khởi chạy trực tiếp trên máy (Dành cho Lập trình viên / Dev)

#### 1. Yêu cầu cài đặt
- **Node.js**: Phiên bản 18 trở lên (`node -v`).
- **PostgreSQL**: Đã cài đặt dịch vụ PostgreSQL 16 (chạy tại port mặc định `5432`). Đã tạo sẵn một database trống (ví dụ: `eventticketing`).

#### 2. Khởi chạy Backend
1. Mở cửa sổ dòng lệnh (Terminal/PowerShell), di chuyển vào thư mục `backend`:
   ```bash
   cd backend
   npm install
   ```
2. Tạo file cấu hình môi trường `.env` tại thư mục `backend/.env`:
   ```env
   PORT=3000
   NODE_ENV=development

   # Cấu hình kết nối PostgreSQL
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=eventticketing
   DB_USER=postgres
   DB_PASSWORD=mat_khau_postgres_cua_ban

   # Khóa bí mật JWT
   JWT_SECRET=dev_secret_key_eventticketing_sprint1_super_secure
   JWT_EXPIRES_IN=7d

   # URL giao diện frontend để gửi link kích hoạt email
   FRONTEND_URL=http://localhost:5173
   ```
3. Chạy migration tạo bảng dữ liệu và nạp dữ liệu khởi tạo:
   ```bash
   # Tạo các bảng cơ sở dữ liệu
   npm run migrate

   # Nạp dữ liệu các vai trò hệ thống (Admin, Organizer, Buyer)
   npm run seed

   # Nạp tài khoản thử nghiệm (Admin, Organizer, Buyer - Mật khẩu chung: 123456)
   node scripts/create-test-users.js

   # Nạp danh sách sự kiện & suất diễn mẫu có sơ đồ ghế
   node scripts/seed-demo-events.js
   ```
4. Khởi động Backend server:
   ```bash
   # Chế độ thông thường:
   npm start

   # Hoặc chế độ Hot-reload khi sửa code:
   npm run dev
   ```
   > Backend API hoạt động tại: **`http://localhost:3000`**  
   > Kiểm tra sức khỏe hệ thống: **`http://localhost:3000/health`**

#### 3. Khởi chạy Frontend
1. Mở một cửa sổ Terminal mới, di chuyển vào thư mục `frontend`:
   ```bash
   cd frontend
   npm install
   ```
2. Tạo file cấu hình môi trường `.env` tại thư mục `frontend/.env`:
   ```env
   # Khi chạy Vite dev server, cấu hình gọi trực tiếp hoặc qua proxy:
   VITE_API_URL=http://localhost:3000/api
   ```
3. Khởi động Frontend dev server:
   ```bash
   npm run dev
   ```
   > Truy cập ứng dụng tại: **`http://localhost:5173`**

---

### Cách 2: Khởi chạy trọn gói bằng Docker Compose (Khuyên dùng khi Demo)

Cách này **không cần** cài Node.js hay PostgreSQL trực tiếp trên máy của bạn.

#### 1. Yêu cầu
- Đã cài đặt và mở **Docker Desktop** (hỗ trợ Linux containers).

#### 2. Thiết lập và Khởi động
1. Tại thư mục gốc của dự án, tạo file `.env` (sao chép từ `.env.example`):
   ```bash
   cp .env.example .env
   ```
   Nội dung file `.env` tại thư mục gốc:
   ```env
   POSTGRES_DB=eventticketing
   POSTGRES_USER=eventticketing
   POSTGRES_PASSWORD=strongpassword123
   FRONTEND_URL=http://localhost:8080
   JWT_SECRET=super_secret_jwt_key_eventticketing_demo_2026
   ```

2. Khởi chạy toàn bộ hệ thống bằng Docker Compose:
   ```bash
   docker compose up --build -d
   ```
   > Docker Compose sẽ tự động:
   > - Khởi động container PostgreSQL (port `5432`) kèm Healthcheck.
   > - Build và khởi động Backend API (port `3000`), tự động chạy `npm run migrate`.
   > - Build Frontend và chạy trên Nginx (port `8080`).

3. Nạp tài khoản thử nghiệm và dữ liệu sự kiện mẫu vào container Backend:
   ```bash
   # Nạp vai trò (roles)
   docker exec -it eventticketing-backend npm run seed

   # Nạp các tài khoản người dùng mẫu
   docker exec -it eventticketing-backend node scripts/create-test-users.js

   # Nạp sự kiện & suất diễn mẫu
   docker exec -it eventticketing-backend node scripts/seed-demo-events.js
   ```

4. Truy cập hệ thống:
   - **Giao diện Web Người Dùng (Frontend):** **`http://localhost:8080`**
   - **Backend API:** **`http://localhost:3000`**
   - **Healthcheck Endpoint:** **`http://localhost:3000/health`**

5. Dừng hệ thống khi không sử dụng:
   ```bash
   docker compose down
   # Nếu muốn xóa sạch cả database volume để chạy lại từ đầu:
   docker compose down -v
   ```

---

## 🔑 5. Tài khoản mẫu để kiểm thử (Test Credentials)

Sau khi chạy lệnh `node scripts/create-test-users.js`, bạn có thể đăng nhập vào hệ thống bằng các tài khoản mẫu sau:

| Vai trò (Role) | Email | Mật khẩu | Quyền hạn & Chức năng |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@test.com` | `123456` | Quản trị toàn hệ thống, xem bảng điều khiển Admin, quản lý người dùng |
| **Organizer** | `organizer@test.com` | `123456` | Ban tổ chức sự kiện: Xem và quản lý các sự kiện, suất diễn đã tạo |
| **Buyer** | `buyer@test.com` | `123456` | Người mua vé: Xem sự kiện, chọn ghế, giữ chỗ (Seat Hold), mua vé |
| **Chưa kích hoạt** | `inactive@test.com` | `123456` | Kiểm tra luồng chặn đăng nhập khi tài khoản chưa xác thực email |

> 💡 **Kiểm tra tính năng khóa tài khoản (Brute-force protection):** Nhập sai mật khẩu liên tiếp 5 lần với tài khoản bất kỳ, hệ thống sẽ trả về mã `423 Locked` và khóa tài khoản trong vòng 15 phút.

---

## 🧪 6. Kiểm thử & Đảm bảo chất lượng (Testing & CI)

Dự án có cấu hình CI tự động và bộ kiểm thử toàn diện:

### 1. Kiểm thử Backend (Unit, Integration & Security Tests)
Tại thư mục `backend/`:
```bash
# Chạy toàn bộ 13 test suites kèm bảng đánh giá độ phủ (coverage)
npm test

# Kiểm tra quy chuẩn cú pháp ESLint
npm run lint

# Kiểm tra tính toàn vẹn khi build
npm run build
```
*Kết quả:* **13 / 13 Test Suites Passed**, **75 / 75 Tests Passed**, **0 Lint Warnings**.  
Các module được kiểm thử:
- `ipRateLimiter.test.js`: Kiểm thử chặn quá tải request và chặn brute-force theo IP.
- `auditLogger.test.js`: Kiểm thử ghi vết nhật ký các truy cập 401/403.
- `buyerRegistration.test.js`: Kiểm thử đăng ký người mua, hash Argon2id, token kích hoạt.
- `authLogin.test.js`: Kiểm thử đăng nhập, cấp JWT, từ chối tài khoản inactive.
- `authLockout.test.js`: Kiểm thử cơ chế khóa tài khoản sau 5 lần sai mật khẩu.
- `authMiddleware.test.js` & `roleMiddleware.test.js`: Kiểm thử xác thực token và kiểm tra quyền RBAC.
- `secureRoute.test.js`: Kiểm thử cơ chế *Deny-by-Default* bảo vệ toàn bộ route kín.
- `events.test.js` & `seatHoldService.test.js`: Kiểm thử xem sự kiện, suất diễn, logic giữ chỗ và nhả ghế.

### 2. Kiểm thử Frontend
Tại thư mục `frontend/`:
```bash
# Kiểm tra định dạng mã nguồn và biến thừa bằng ESLint
npm run lint

# Biên dịch sản phẩm production với Vite
npm run build
```
*Kết quả:* **ESLint 0 errors, 0 warnings** (tuân thủ cờ khắt khe `--max-warnings 0`), `vite build` tạo bundle production hoàn chỉnh trong thư mục `dist/`.

---

## 📡 7. Danh sách API Endpoints chính

### Xác thực & Tài khoản (`/api/auth`)
- `POST /api/auth/register` - Đăng ký tài khoản Buyer mới.
- `GET /api/auth/activate?token=...` - Kích hoạt tài khoản qua mã token email.
- `POST /api/auth/login` - Đăng nhập, trả về JWT Token và thông tin người dùng.
- `GET /api/auth/me` - Kiểm tra tính hợp lệ của token và lấy thông tin phiên hiện tại.

### Sự kiện & Suất diễn (`/api/events`, `/api/showtimes`)
- `GET /api/events` - Lấy danh sách sự kiện mở bán (hỗ trợ lọc theo danh mục, từ khóa).
- `GET /api/events/:id` - Lấy chi tiết thông tin sự kiện và các suất diễn liên quan.
- `POST /api/events` - Tạo sự kiện mới (Yêu cầu quyền `organizer` hoặc `admin`).
- `GET /api/showtimes/:id` - Lấy thông tin chi tiết suất diễn và trạng thái sơ đồ ghế.
- `POST /api/showtimes/:id/hold` - Giữ chỗ ghế ngồi tạm thời trong 10 phút (Yêu cầu đăng nhập).
- `DELETE /api/showtimes/:id/hold` - Hủy giữ chỗ ghế ngồi.
- `PUT /api/showtimes/:id/seat-map` - Nạp/thay sơ đồ ghế từ tệp JSON (organizer sở hữu sự kiện hoặc `admin`, xem mục 9).
- `GET /api/events/:id/showtimes` - Organizer/admin xem mọi suất của sự kiện (kể cả nháp) kèm số ghế (xem mục 10).
- `POST /api/showtimes/:id/open-sales`, `POST /api/showtimes/:id/close-sales` - Mở bán / đóng bán suất diễn (xem mục 10).
- `GET /api/showtimes/:id/status-log` - Nhật ký đổi trạng thái mở bán kèm người thao tác.

### Hệ thống
- `GET /health` - Health check kiểm tra trạng thái hoạt động của Backend server.

---

## 8. S-12 / SCRUM-176: Nhả giữ chỗ hết hạn (T-27, T-28)

Giữ chỗ được lưu trong bảng PostgreSQL `seat_holds` (migration `006`), thay cho
store trong bộ nhớ của spike SCRUM-84. API hiện tại vẫn giữ **số lượng chỗ của
một suất diễn**, chưa có mã ghế riêng; dữ liệu và API theo từng ghế của S-10/T-22
cần dùng cùng quy tắc trạng thái và khóa khi được tích hợp.

- `active` và `expires_at > thời gian DB`: trừ vào số chỗ trống.
- `active` đã hết hạn: truy vấn chỗ trống bỏ qua ngay, dù job chưa chạy.
- Job đổi giữ chỗ quá hạn từ `active` sang `cancelled`, lưu `cancelled_at`;
  chạy lại không đổi thời điểm huỷ hoặc ghi nhận huỷ thêm lần nữa.
- `pending_payment` và `confirmed`: luôn trừ vào sức chứa, job hết hạn giữ chỗ
  và API huỷ giữ chỗ không được nhả chúng.

`npm start`, `npm run dev` và `node src/app.js` đều chạy job ngay khi khởi động,
dọn toàn bộ tồn đọng không giới hạn tuổi dữ liệu, rồi lặp mỗi 30 giây. Một tiến
trình không chạy chồng job; nhiều tiến trình dùng câu UPDATE có điều kiện để
không huỷ hai lần. Khi DB lỗi, job ghi thông báo chung và thử lại ở lượt kế tiếp.
Tắt tiến trình chờ job hoàn tất rồi đóng kết nối DB.

Truy vấn chỗ trống chỉ đọc dữ liệu. API tạo/thay giữ chỗ hiện có được nối với
store PostgreSQL và khóa hàng `showtimes` bằng `FOR UPDATE`, lấy thời gian DB
sau khi giành khóa và dùng sức chứa từ DB. Đây là bảo toàn hành vi giữ chỗ
hiện có khi chuyển store để phục vụ S-12; không thêm API hoặc luồng đặt chỗ mới.

### Cấu hình và cập nhật schema

Chạy `cd backend && npm run migrate` trước khi khởi động phiên bản mới.
Compose phát triển và staging chạy migration trước server.
Giữ chỗ của spike chỉ có trong bộ nhớ tiến trình cũ và không thể backfill:
khi triển khai lần đầu, dừng nhận giữ chỗ mới và chờ TTL của các giữ chỗ cũ
hết trước khi thay phiên bản.

| Biến môi trường | Mặc định | Giá trị hợp lệ |
| --- | --- | --- |
| `SEAT_HOLD_TTL_SECONDS` | `600` | Số nguyên dương (giữ quy tắc TTL hiện có) |
| `SEAT_HOLD_CLEANUP_INTERVAL_MS` | `30000` | Số nguyên 100–2147483647 mili giây |

Giá trị không hợp lệ dùng mặc định. Với Compose, khai báo trong `.env` ở gốc
repository; chạy trực tiếp thì khai báo trong `backend/.env`.

### Phạm vi S-12 và dữ liệu đã chuyển sang đơn hàng

S-12 gồm **T-27 / SCRUM-177** (job dọn giữ chỗ hết hạn) và **T-28 / SCRUM-178**
(truy vấn chỗ trống theo thời điểm hết hạn). Bảng giữ chỗ bền vững cần cho job
khôi phục sau restart; API giữ/hủy hiện có tiếp tục dùng cùng dữ liệu này.

Job chỉ huỷ hàng `status = 'active'`, `order_id IS NULL`, `expires_at <= thời gian DB`.
Nếu dữ liệu do luồng đơn hàng tạo đã có `status = 'pending_payment'` hoặc
`confirmed`, job không đụng tới hàng đó và truy vấn vẫn tính chỗ là đang bận.
Kiểm thử AC4 nạp sẵn các hàng này làm điều kiện đầu vào. S-12 không triển khai
chuyển giữ chỗ thành đơn hàng, tạo đơn, thanh toán hoặc webhook.

Các endpoint hiện có không đổi:
`GET /api/showtimes/:id/availability`, `POST /api/showtimes/:id/holds`,
`DELETE /api/showtimes/holds/:holdId`. Các hàm service nay là bất đồng bộ.
Lỗi truy vấn/job không in thông tin người dùng, mã đơn hoặc tham số SQL ra log.

### Kiểm thử và nghiệm thu

```bash
cd backend
npm test
npm run lint
npm run build
# Cần PostgreSQL thật, cấu hình DB_* trỏ tới database kiểm thử riêng:
npm run test:integration
```

Test tích hợp tạo schema tạm riêng rồi xoá schema đó; không dùng dữ liệu người
dùng. GitHub Actions đặt `RUN_SEAT_HOLD_DB_TESTS=1` và chạy trên PostgreSQL 16;
DB không truy cập được làm test thất bại, không bỏ qua lỗi. Kiểm thử bao gồm
đúng mốc hết hạn, startup dọn 150 giữ chỗ tồn đọng trong tiến trình mới, hai
backend dùng chung DB, 20 người cùng giữ chỗ cuối, các job dọn đồng thời và
bảo vệ dữ liệu đã thuộc đơn hàng trước các job dọn đồng thời.

Trước khi đánh dấu Done trên Jira: một thành viên khác duyệt PR, CI xanh,
chạy bốn AC trên staging và kiểm tra kết quả quét phụ thuộc. Kết quả unit test
không thay cho nghiệm thu staging hoặc thử nghiệm bán vé của E-05.

## 9. S-05: Nạp sơ đồ ghế từ tệp JSON (T-11, T-12)

**T-11:** migration `007` tạo bảng `seat_categories` (hạng ghế theo từng suất diễn,
tên không trùng trong một suất) và `seats` (`row_label`, `seat_number`, `category_id`;
không trùng hàng + số trong một suất). Khoá ngoại ghép bảo đảm hạng ghế của một ghế
luôn thuộc cùng suất diễn. Giá theo hạng do S-15 bổ sung sau.

**T-12:** `PUT /api/showtimes/:id/seat-map` (organizer sở hữu sự kiện hoặc `admin`):

```json
{ "seats": [
  { "row": "A", "number": 1, "category": "VIP" },
  { "row": "A", "number": 2, "category": "VIP" },
  { "row": "B", "number": 1, "category": "Thường" }
] }
```

- Toàn bộ việc nạp chạy trong **một giao dịch** và khoá dòng suất diễn (cùng khoá với API giữ chỗ).
- Hạng ghế chưa có được tạo theo tên trong tệp; hạng đã có được dùng lại.
- Suất đã có sơ đồ nhưng chưa bán/giữ: sơ đồ cũ bị thay toàn bộ.
- Suất đang có người giữ chỗ, đang chờ thanh toán hoặc đã bán: trả **409** `SEAT_MAP_LOCKED` kèm lý do.
- Lỗi ở bất kỳ ghế nào: rollback, không lưu ghế nào.
- Sức chứa (`capacity`) của suất được cập nhật bằng số ghế trong sơ đồ.
- Tệp được kiểm tra trước khi ghi: tối đa 10.000 ghế, 50 hạng; `row` 1–10 ký tự,
  `number` 1–9999, `category` 1–100 ký tự, không trùng ghế. Lỗi trả **400** kèm vị trí ghế (tối đa 10 lỗi).
  Giới hạn body JSON của API là 1 MB.

Ví dụ: `docs/seat-map-sample.json`

```bash
curl -X PUT http://localhost:3000/api/showtimes/1/seat-map \
  -H "Authorization: Bearer <token organizer>" -H "Content-Type: application/json" \
  --data-binary @docs/seat-map-sample.json
```

Kiểm thử: `tests/seatMap.test.js` (validate, phân quyền) và `tests/seatMap.integration.test.js`
(PostgreSQL thật, bật bằng `RUN_SEAT_MAP_DB_TESTS=1`): đủ 4 AC, gồm lỗi giả lập ở ghế thứ 1.500,
và tệp 2.000 ghế dưới 5 giây.

---

## 10. S-07: Mở bán / đóng bán suất diễn (T-15, T-16)

**T-15:** migration `008` thêm cột `showtimes.status` (enum `showtime_sale_status`) và bảng
`showtime_status_logs`. Suất **tạo mới mặc định là nháp**; suất có sẵn trước S-07 được chuyển thành đang bán
để giữ hành vi cũ.

| Trạng thái | Người mua thấy? | Giữ chỗ mới? | Chuyển sang |
|---|---|---|---|
| `draft` (nháp) | Không | Không | `on_sale` (mở bán) |
| `on_sale` (đang bán) | Có | Có | `closed` (đóng bán) |
| `closed` (đã đóng bán) | Có, ghi "đã đóng bán" | Không | `on_sale` (mở bán lại) |

- Mở bán bị chặn kèm lý do (409) khi: chưa có sơ đồ ghế (`NO_SEAT_MAP`), sự kiện chưa công khai
  (`EVENT_NOT_PUBLISHED`), suất đã bắt đầu (`SHOWTIME_STARTED`), hoặc chuyển sai luật
  (`INVALID_TRANSITION`, `ALREADY_IN_STATUS`).
- Đóng bán chỉ chặn **giữ chỗ mới**; lượt giữ và đơn đang chờ vẫn huỷ, hết hạn, được job dọn như bình thường.
  Việc kiểm tra trạng thái nằm trong khoá dòng suất diễn của API giữ chỗ, nên không lượt giữ nào lọt qua sau khi đã đóng.
- Mỗi lần đổi trạng thái ghi `showtime_status_logs` (trạng thái cũ, mới, id người thao tác, thời điểm). Nhật ký chỉ lưu id, không lưu email.

**T-16:** trang `/organizer` có khu "Suất diễn" dưới mỗi sự kiện: trạng thái, số ghế, nút nạp sơ đồ ghế (JSON),
nút **Mở bán** / **Đóng bán** / **Mở bán lại**; lý do bị chặn hiện ngay dưới suất đó.
Script `scripts/seed-demo-events.js` tạo suất demo kèm sơ đồ ghế và đã mở bán.

Kiểm thử: `tests/showtimeSale.test.js` (phân quyền, mã lỗi) và `tests/showtimeSale.integration.test.js`
(PostgreSQL thật, bật bằng `RUN_SHOWTIME_SALE_DB_TESTS=1`): 4 AC, nhật ký, migration dữ liệu cũ, và đóng bán
giữa lúc 20 người đang giữ chỗ.

---

## 👥 11. Đội ngũ phát triển

* **Nhóm thực tập:** `T926_K19C5_N5`
* **Môn học:** Thực tập Chuyên sâu (TTCS)
* **GitHub Repository:** [EvenTicketing_TTCS_T926_K19C5_N5](https://github.com/Tphand2877/EvenTicketing_TTCS_T926_K19C5_N5)
# Minh Quang: public queries (T-17, T-19)

Public showtime cursor pagination, category price ranges, Redis cache (30 seconds),
and the single-query seat-state API are documented in
[docs/minh-quang-public-queries.md](docs/minh-quang-public-queries.md).
Configure `REDIS_URL` using `.env.example`. T-11 (migration 007) and T-15 (migration 008) now exist; per-seat hold/ticket read
adapters must be connected before these new endpoints are available on staging.

## 🎟️ Sơ đồ ghế còn trống (SCRUM-165 / S-09)

* **User Story:** Là người mua vé tôi muốn nhìn sơ đồ ghế và biết ghế nào còn trống để chọn được chỗ ngồi mình muốn.
* **Sub-tasks:**
  - **T-19**: Truy vấn trạng thái ghế theo suất diễn trong một lần gọi duy nhất (`GET /api/showtimes/:id/seats`), trả về đầy đủ trạng thái của toàn bộ ghế (`available`, `held`, `sold`), không phát sinh N+1 truy vấn.
  - **T-20**: Vẽ sơ đồ ghế trực quan trên trình duyệt (`SeatMapCanvas`, `SeatLegend`):
    - 3 trạng thái ghế phân biệt rõ ràng bằng cả màu sắc và ký hiệu (○: Trống / xanh lá; ⏳: Đang có người giữ / vàng hổ phách; ✕: Đã bán / xám; ✓: Đang chọn / hồng tím).
    - Hỗ trợ phóng to thu nhỏ mượt mà trên điện thoại (+, -, 100%, phạm vi 50% - 220%) và bấm trúng ghế chính xác (AC5).
    - Suất diễn chưa nạp sơ đồ ghế hiển thị thông báo *"Suất diễn chưa mở bán"*, không render lưới rỗng (AC3).
    - Tải lại trang phản ánh ngay trạng thái ghế vừa bị người khác giữ chuyển sang "Đang có người giữ" (AC2).
  - **T-21**: Tệp mẫu 2000 ghế (`sample-seat-map-2000.json`) và bộ đo thời gian hiển thị: kiểm thử benchmark tự động đo thời gian xử lý và dựng cấu trúc 2000 ghế đạt ~1-2ms, đáp ứng hoàn hảo tiêu chí < 2 giây (AC4).

