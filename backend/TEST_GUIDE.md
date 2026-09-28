# Hướng dẫn Test - SCRUM-72: Login & Role-Based Access

Phạm vi: SCRUM-73 (users/roles + migration), SCRUM-74 (đăng nhập email/password), SCRUM-75 (RBAC middleware).

---

## 1. Test tự động (bắt buộc, làm trước)

Không cần kết nối PostgreSQL, vì các test đã mock DB.

```bash
cd backend
npm install
npm test
```

**Kết quả đạt (PASS):**
- 3 test suites passed, 3 total
- 13 tests passed, 13 total
- Không có log "Server đang chạy tại..." xen giữa kết quả test
- Không có cảnh báo "A worker process has failed to exit gracefully"

Nếu có test FAIL, dán log lỗi lại để dev sửa trước khi test tay ở bước 2.

---

## 2. Chuẩn bị môi trường để test tay (test API thật)

### 2.1. Yêu cầu
- Node.js đã cài
- PostgreSQL đã cài và đang chạy (service `postgresql-x64-<version>` ở trạng thái Running)

### 2.2. Cấu hình
```bash
cp .env.example .env
```
Mở `.env`, sửa `DB_PASSWORD` thành đúng mật khẩu PostgreSQL của máy bạn.

### 2.3. Tạo database, bảng, dữ liệu mẫu
```bash
# Tạo database (chỉ cần làm 1 lần)
# Dùng pgAdmin: chuột phải Databases > Create > Database > tên "event_ticketing"
# Hoặc dùng psql:
"C:\Program Files\PostgreSQL\<version>\bin\psql.exe" -U postgres -c "CREATE DATABASE event_ticketing;"

# Tạo bảng users, roles
npm run migrate

# Seed 3 roles mặc định: admin, organizer, buyer
npm run seed

# Tạo 4 user mẫu để test (mật khẩu chung: 123456)
node scripts/create-test-users.js
```

User mẫu được tạo ra:

| Email | Role | is_active | Dùng để test |
|---|---|---|---|
| admin@test.com | admin | true | Login thành công, route admin-only |
| organizer@test.com | organizer | true | Login thành công, route admin+organizer |
| buyer@test.com | buyer | true | Login thành công, bị chặn ở route admin/organizer |
| inactive@test.com | buyer | false | Login thất bại vì chưa kích hoạt (403) |

Mật khẩu của cả 4 user: `123456`

### 2.4. Chạy server
```bash
npm run dev
```
Kết quả đạt: thấy dòng `🚀 Server đang chạy tại http://localhost:3000`. Giữ cửa sổ này mở trong suốt quá trình test.

Kiểm tra nhanh server sống: mở trình duyệt `http://localhost:3000/health`, phải thấy `{"status":"ok", ...}`.

---

## 3. Test API bằng PowerShell

Mở **cửa sổ PowerShell mới** (giữ nguyên cửa sổ đang chạy server), chạy từng lệnh sau và đối chiếu kết quả mong đợi.

### 3.1. Đăng nhập (POST /api/auth/login)

**TC-01 - Đăng nhập đúng → 200**
```powershell
$r = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType "application/json" -Body '{"email":"admin@test.com","password":"123456"}'
$r
```
Kết quả đạt: `success: true`, có `data.accessToken`, `data.user.role` = `admin`.

**TC-02 - Sai mật khẩu → 401**
```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType "application/json" -Body '{"email":"admin@test.com","password":"saimatkhau"}'
```
Kết quả đạt: lỗi HTTP 401.

**TC-03 - Email không tồn tại → 401**
```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType "application/json" -Body '{"email":"khongtontai@test.com","password":"123456"}'
```
Kết quả đạt: lỗi HTTP 401. Thông báo lỗi phải **giống hệt** TC-02 (không được lộ email có tồn tại hay không).

**TC-04 - Tài khoản chưa kích hoạt → 403**
```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType "application/json" -Body '{"email":"inactive@test.com","password":"123456"}'
```
Kết quả đạt: lỗi HTTP 403, message có chữ "kích hoạt".

**TC-05 - Thiếu password → 400**
```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType "application/json" -Body '{"email":"admin@test.com"}'
```
Kết quả đạt: lỗi HTTP 400.

**TC-06 - Email sai định dạng → 400**
```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType "application/json" -Body '{"email":"khong-phai-email","password":"123456"}'
```
Kết quả đạt: lỗi HTTP 400.

### 3.2. Xem thông tin bản thân (GET /api/auth/me)

**TC-07 - Có token hợp lệ → 200**
```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/auth/me -Headers @{Authorization="Bearer $($r.data.accessToken)"}
```
Kết quả đạt: `success: true`, trả về đúng email/role của admin.

**TC-08 - Không có token → 401**
```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/auth/me
```
Kết quả đạt: lỗi HTTP 401.

**TC-09 - Token sai/giả → 401**
```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/auth/me -Headers @{Authorization="Bearer token-gia-mao-123"}
```
Kết quả đạt: lỗi HTTP 401, message "Token không hợp lệ."

### 3.3. Phân quyền RBAC (protected routes)

Lấy token cho từng role trước:
```powershell
$admin = (Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType "application/json" -Body '{"email":"admin@test.com","password":"123456"}').data.accessToken
$organizer = (Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType "application/json" -Body '{"email":"organizer@test.com","password":"123456"}').data.accessToken
$buyer = (Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType "application/json" -Body '{"email":"buyer@test.com","password":"123456"}').data.accessToken
```

| # | Route | Token dùng | Kết quả đạt |
|---|---|---|---|
| TC-10 | GET /api/dashboard | admin / organizer / buyer (bất kỳ) | 200 - mọi role đăng nhập đều xem được |
| TC-11 | GET /api/admin/users | admin | 200 |
| TC-12 | GET /api/admin/users | organizer | 403 |
| TC-13 | GET /api/admin/users | buyer | 403 |
| TC-14 | GET /api/organizer/events | admin | 200 |
| TC-15 | GET /api/organizer/events | organizer | 200 |
| TC-16 | GET /api/organizer/events | buyer | 403 |
| TC-17 | GET /api/buyer/tickets | admin / organizer / buyer (bất kỳ) | 200 - mọi role đều xem được |

Ví dụ chạy TC-12 (organizer bị chặn khỏi route admin):
```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/admin/users -Headers @{Authorization="Bearer $organizer"}
```
Kết quả đạt: lỗi HTTP 403, message có nội dung "Yêu cầu role: admin".

Làm tương tự cho các dòng còn lại trong bảng, đổi route và biến token (`$admin` / `$organizer` / `$buyer`) tương ứng.

---

## 4. Bảng tổng hợp kết quả (điền khi test)

| Test case | Kết quả mong đợi | Thực tế | Đạt/Không đạt |
|---|---|---|---|
| npm test | 13/13 pass | | |
| TC-01 Login đúng | 200 + accessToken | | |
| TC-02 Sai mật khẩu | 401 | | |
| TC-03 Email không tồn tại | 401 | | |
| TC-04 Chưa kích hoạt | 403 | | |
| TC-05 Thiếu password | 400 | | |
| TC-06 Sai định dạng email | 400 | | |
| TC-07 GET /me có token | 200 | | |
| TC-08 GET /me không token | 401 | | |
| TC-09 GET /me token giả | 401 | | |
| TC-10 /dashboard mọi role | 200 | | |
| TC-11 /admin/users - admin | 200 | | |
| TC-12 /admin/users - organizer | 403 | | |
| TC-13 /admin/users - buyer | 403 | | |
| TC-14 /organizer/events - admin | 200 | | |
| TC-15 /organizer/events - organizer | 200 | | |
| TC-16 /organizer/events - buyer | 403 | | |
| TC-17 /buyer/tickets mọi role | 200 | | |

Nếu tất cả các dòng đều "Đạt" → có thể merge PR.

---

## 5. Ghi chú

- File `.env` và `node_modules/` không được commit lên Git (đã có trong `.gitignore`).
- File `scripts/create-test-users.js` chỉ phục vụ test cục bộ, không phải một phần chức năng chính thức của ứng dụng.
- Nếu gặp lỗi `password authentication failed for user "postgres"`, kiểm tra lại `DB_PASSWORD` trong `.env` có khớp với mật khẩu PostgreSQL thật không.
- Nếu port 3000 đã bị chiếm, đổi `PORT` trong `.env` rồi khởi động lại `npm run dev`.
