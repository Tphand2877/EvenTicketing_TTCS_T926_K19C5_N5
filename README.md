# EvenTicketing - Hệ thống Bán Vé Sự Kiện Có Sơ Đồ Ghế

> **Dự án thực tập chuyên sâu:** `EvenTicketing_TTCS_T926_K19C5_N5`  
> **Phiên bản:** Sprint 1  
> **Kiến trúc:** Monorepo (Frontend React/Vite + Backend Express/Knex + PostgreSQL + Docker)

---

## 📌 Giới thiệu dự án

**EvenTicketing** là nền tảng quản lý và bán vé sự kiện trực tuyến hỗ trợ sơ đồ ghế tương tác theo thời gian thực. Hệ thống được xây dựng theo kiến trúc phân tách rõ ràng giữa Frontend và Backend, đáp ứng các tiêu chuẩn bảo mật khắt khe (Argon2id, JWT RBAC, Rate Limiting, Audit Logging) và sẵn sàng đóng gói triển khai qua Docker.

### 🚀 Tính năng cốt lõi (Sprint 1)
- **Xác thực & Phân quyền (SCRUM-72):**
  - Đăng nhập an toàn cấp JWT Token.
  - Phân quyền theo vai trò (RBAC): `admin`, `organizer`, `buyer`.
  - Cơ chế phòng chống Brute-force: Khóa tài khoản tạm thời khi đăng nhập sai nhiều lần và giới hạn IP Rate Limit.
  - Audit logging: Tự động ghi vết mọi truy cập bị từ chối (401/403) vào database.
- **Đăng ký & Kích hoạt Email (SCRUM-76):**
  - Đăng ký tài khoản người mua (Buyer) với mật khẩu chuẩn bảo mật cao.
  - Sinh mã kích hoạt an toàn (Activation Token 24h, mã hóa SHA-256).
  - Luồng xác thực kích hoạt tài khoản qua đường link an toàn trước khi cho phép đăng nhập.
- **Quản lý & Xem sự kiện (SCRUM-80):**
  - Xem danh sách sự kiện và suất diễn đang mở bán.
  - Xem chi tiết thông tin sự kiện.
- **Hạ tầng & DevOps (SCRUM-67 → 71, Staging):**
  - Pipeline GitHub Actions CI tự động Lint, Test, Build.
  - Đóng gói Docker đa tầng (Multi-stage build với Nginx cho Frontend).
  - Tự động hóa triển khai môi trường Staging.

---

## 🛠️ Công nghệ sử dụng (Tech Stack)

| Thành phần | Công nghệ chính |
| :--- | :--- |
| **Frontend** | React 18, Vite 5, Tailwind CSS, Axios, React Router DOM v6 |
| **Backend** | Node.js, Express.js, Knex.js (Query Builder & Migrations) |
| **Database** | PostgreSQL 16+ |
| **Bảo mật** | Argon2id, JSON Web Token (JWT), express-rate-limit |
| **Testing** | Jest, Supertest (11 Test Suites, 45 Tests passed) |
| **DevOps & CI/CD** | Docker, Docker Compose, Nginx Alpine, GitHub Actions |

---

## 📂 Cấu trúc thư mục dự án

```text
EvenTicketing_TTCS_T926_K19C5_N5/
├── .github/
│   └── workflows/
│       ├── ci.yml                             # Pipeline CI: Lint, Unit Test, Build check
│       └── deploy-staging.yml                 # Pipeline tự động deploy môi trường Staging
├── backend/
│   ├── src/
│   │   ├── config/                            # Cấu hình Database & Security
│   │   ├── controllers/                       # Xử lý logic nghiệp vụ (Auth, Event)
│   │   ├── middleware/                        # Auth, Role, RateLimiter, AuditLog
│   │   ├── migrations/                        # Knex migrations (tạo bảng DB)
│   │   ├── models/                            # Models (User, Role, Event, AuditLog)
│   │   ├── routes/                            # Định nghĩa API Endpoints
│   │   ├── services/                          # EmailService, TokenService
│   │   ├── utils/                             # Password hash (Argon2id), Token generator
│   │   ├── app.js                             # Express application
│   │   └── server.js                          # Server entry point
│   ├── seeds/                                 # Dữ liệu mẫu khởi tạo (Roles, Admin)
│   ├── tests/                                 # Bộ kiểm thử tự động (Jest + Supertest)
│   ├── Dockerfile                             # Dockerfile đóng gói backend
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/                        # UI Components (auth, common, event)
│   │   ├── context/                           # AuthContext (quản lý state đăng nhập)
│   │   ├── pages/                             # Trang (Login, Register, VerifyEmail, EventList...)
│   │   ├── routes/                            # Route bảo vệ (PrivateRoute)
│   │   ├── services/                          # Gọi API (apiClient, authService)
│   │   └── App.jsx
│   ├── Dockerfile                             # Multi-stage build đóng gói Nginx
│   ├── nginx.conf                             # Cấu hình Nginx reverse proxy
│   └── package.json
├── scripts/
│   └── deploy-staging.ps1                     # Script triển khai Staging có healthcheck & rollback
├── docker-compose.yml                         # Chạy toàn bộ hệ thống cục bộ
├── docker-compose.staging.yml                 # Chạy toàn bộ hệ thống môi trường Staging
└── README.md
```

---

## 🚀 Hướng dẫn cài đặt và Khởi chạy

Có 2 cách để khởi chạy dự án:

### Cách 1: Chạy trực tiếp trên máy (Khuyên dùng khi lập trình & sửa code)

#### 1. Yêu cầu tiên quyết
- **Node.js**: Phiên bản 18 trở lên (kiểm tra: `node -v`).
- **PostgreSQL**: Đã cài đặt và đang chạy dịch vụ trên máy (cổng mặc định `5432`).

#### 2. Cài đặt Backend
1. Di chuyển vào thư mục backend và cài đặt thư viện:
   ```powershell
   cd backend
   npm install
   ```
2. Tạo file cấu hình môi trường `.env` tại thư mục `backend/.env`:
   ```env
   PORT=3000
   NODE_ENV=development

   # Cấu hình PostgreSQL máy của bạn
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=eventticketing
   DB_USER=postgres
   DB_PASSWORD=your_postgres_password

   # JWT bí mật
   JWT_SECRET=dev_secret_key_123456789_eventticketing
   JWT_EXPIRES_IN=7d

   # URL frontend để sinh link kích hoạt email
   FRONTEND_URL=http://localhost:5173
   ```
3. Chạy migration tạo bảng và nạp dữ liệu mẫu ban đầu:
   ```powershell
   npm run migrate
   npm run seed
   ```
4. Khởi chạy Backend server:
   ```powershell
   npm start
   # Hoặc chế độ tự reload khi sửa code:
   npm run dev
   ```
   > Backend sẽ lắng nghe tại: [http://localhost:3000](http://localhost:3000)  
   > Kiểm tra sức khỏe hệ thống: [http://localhost:3000/health](http://localhost:3000/health)

#### 3. Cài đặt Frontend
1. Mở một cửa sổ Terminal mới, di chuyển vào thư mục frontend và cài đặt thư viện:
   ```powershell
   cd frontend
   npm install
   ```
2. Tạo file cấu hình môi trường `.env` tại thư mục `frontend/.env`:
   ```env
   VITE_API_URL=/api
   ```
3. Khởi chạy Frontend server:
   ```powershell
   npm run dev
   ```
   > Truy cập giao diện ứng dụng tại: **[http://localhost:5173](http://localhost:5173)**

---

### Cách 2: Khởi chạy bằng Docker Compose (Khuyên dùng khi demo / kiểm thử môi trường chuẩn)

Cách này không cần cài Node.js hay PostgreSQL trên máy chủ máy phát triển:

1. Đảm bảo máy đã cài và bật **Docker Desktop**.
2. Tạo file `.env` ở thư mục gốc nếu cần tùy biến mật khẩu (mặc định đã có sẵn giá trị fallback).
3. Chạy một câu lệnh duy nhất:
   ```bash
   docker compose up --build
   ```
4. Hệ thống sẽ tự động khởi động 3 container:
   - **PostgreSQL**: Cổng `5432`
   - **Backend API**: Cổng `3000`
   - **Frontend (Nginx)**: Cổng `8080` $\rightarrow$ Truy cập: **[http://localhost:8080](http://localhost:8080)**

---

## 🧪 Kiểm thử & Đảm bảo chất lượng (Testing & Linting)

Dự án áp dụng quy chuẩn kiểm thử tự động nghiêm ngặt trước khi merge:

### Chạy Backend Tests (Jest)
Kiểm thử toàn bộ luồng Auth, RBAC, Rate Limiter, Khóa tài khoản, Băm mật khẩu, Database:
```powershell
cd backend
npm test
```
*Kết quả đạt: **11/11 Test Suites Passed**, **45/45 Tests Passed**, độ phủ code > 85%.*

### Kiểm tra Frontend Lint & Build
```powershell
cd frontend
npm run lint    # Kiểm tra chuẩn mã nguồn ESLint (0 warning, 0 error)
npm run build   # Đảm bảo quá trình biên dịch Vite thành công
```

---

## 🔑 Tài khoản mẫu để kiểm thử (Test Accounts)

Sau khi chạy `npm run seed`, cơ sở dữ liệu đã có sẵn các tài khoản mẫu:

| Vai trò (Role) | Email | Mật khẩu | Mục đích |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@eventticketing.com` | `Admin@123456` | Quản trị toàn hệ thống |
| **Organizer** | `organizer@eventticketing.com` | `Organizer@123456` | Quản lý & tạo sự kiện |
| **Buyer** | `buyer@eventticketing.com` | `Buyer@123456` | Mua vé, xem sự kiện |

---

## 👥 Đội ngũ phát triển (Sprint 1)
- Nhóm sinh viên: **T926_K19C5_N5**
- Repository: [Tphand2877/EvenTicketing_TTCS_T926_K19C5_N5](https://github.com/Tphand2877/EvenTicketing_TTCS_T926_K19C5_N5)
