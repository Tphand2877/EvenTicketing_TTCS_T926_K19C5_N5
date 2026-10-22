# [S-28] Quản trị tạo tài khoản nhân viên và gán vai trò

> **Mã trong kế hoạch:** `S-28`  
> **Jira Epic:** `E-02 – Tài khoản và phân quyền`  
> **Ưu tiên (MoSCoW):** `Must`  
> **Tier:** `Ready` (đã hoàn thiện Refine từ `Next`)  
> **Sprint:** `Sprint 4` (Mục tiêu sprint: Người mua nhận vé QR không làm giả được và nhân viên soát được vé tại cửa, mỗi vé một lần)  
> **Phụ thuộc:** `S-02` (Xác thực và phân quyền RBAC), `S-03` (Quản lý trạng thái tài khoản)  
> **Story Points:** **3 SP** (Re-estimated: Cập nhật từ ước lượng thô 2 SP lên 3 SP do phạm vi bao gồm quản lý vai trò đa cấp, đồng bộ quyền thời gian thực và màn hình soát vé)  
> **Assignee:** Vinh Đỗ  
> **Reporter:** Thuận Phan  

---

## 1. USER STORY

> **Là quản trị hệ thống (System Administrator)**,  
> **Tôi muốn** tạo tài khoản cho nhân viên soát vé, kế toán và ban tổ chức, gán vai trò tương ứng và quản lý kích hoạt/vô hiệu hóa,  
> **Để** không ai tự cấp cho mình quyền nội bộ và mỗi vai trò chỉ truy cập đúng phạm vi nghiệp vụ được phân công.

---

## 2. TIÊU CHÍ CHẤP NHẬN (ACCEPTANCE CRITERIA)

### AC 1: Phân quyền giao diện cho vai trò Soát vé (Ticket Checker)
- **Given** Quản trị viên tạo tài khoản với vai trò Soát vé (`ticket_checker`),
- **When** Nhân viên soát vé đăng nhập vào hệ thống qua `/login`,
- **Then** Hệ thống tự động chuyển hướng và **chỉ hiển thị màn hình quét vé** (`/scanner`).
- **And** Header / Menu điều hướng ẩn toàn bộ các liên kết mua vé công khai (`/events`), quản lý sự kiện (`/organizer`) và quản trị (`/admin`).
- **And** Nếu nhân viên cố tình truy cập thủ công các đường dẫn khác (như `/events`, `/`, `/checkout`), hệ thống tự động redirect về `/scanner`.

### AC 2: Quyền mới có hiệu lực tức thì (Real-time RBAC Enforcement)
- **Given** Một tài khoản đang đăng nhập với JWT token còn hạn,
- **When** Quản trị viên thay đổi vai trò của tài khoản đó (ví dụ từ `organizer` sang `buyer`),
- **Then** Khi người dùng đó thực hiện lệnh gọi API tiếp theo, vai trò và quyền mới **có hiệu lực ngay lập tức mà không cần đăng xuất hay đăng nhập lại**.
- **And** Nếu hành động đó không còn được cho phép ở vai trò mới, API trả về HTTP `403 Forbidden` ngay lập tức.

### AC 3: Xử lý tài khoản bị vô hiệu hóa (Account Deactivation)
- **Given** Quản trị viên vô hiệu hóa một tài khoản (`is_active = false`, ghi nhận `deactivated_at`),
- **When** Người dùng của tài khoản này cố gắng đăng nhập qua `/api/auth/login`,
- **Then** Hệ thống từ chối đăng nhập với HTTP `403 Forbidden` kèm thông báo rõ ràng: `"Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên để được hỗ trợ."`
- **And** Nếu tài khoản đang đăng nhập và có token gọi API tiếp theo, hệ thống cũng từ chối với HTTP `403 Forbidden`.

---

## 3. YÊU CẦU PHI CHỨC NĂNG & RÀNG BUỘC (NFR)

1. **NFR-1 (Audit Logging):** Mọi hành động thay đổi vai trò hoặc thay đổi trạng thái kích hoạt tài khoản phải được ghi vết vào bảng `role_change_logs` gồm: `actor_id` (người thực hiện thao tác), `target_user_id` (tài khoản chịu tác động), `old_role`, `new_role`, `action`, `ip_address`, `created_at`.
2. **NFR-2 (Bảo mật thông tin):** Tuyệt đối không log mật khẩu, hash mật khẩu hoặc PII nhạy cảm trong log ứng dụng và audit logs.
3. **NFR-3 (Chuẩn mã hóa mật khẩu):** Mật khẩu ban đầu do admin cấp khi tạo tài khoản nhân viên phải được băm an toàn bằng thuật toán **Argon2id** (kế thừa tiêu chuẩn bảo mật từ S-02).
4. **NFR-4 (Nguyên tắc đặc quyền tối thiểu - PoLP):** Chỉ tài khoản có role `admin` mới được gọi các API quản lý nhân viên và gán quyền (`/api/admin/*`).
5. **NFR-5 (Phòng vệ tự hạ quyền):** Admin không thể tự vô hiệu hóa tài khoản của chính mình hoặc tự xóa quyền admin của bản thân nếu là admin duy nhất đang hoạt động.

---

## 4. BẢNG PHÂN RÃ CÔNG VIỆC (SUB-TASKS / WBS)

| Sub-task ID | Tiêu đề Sub-task | Phân hệ | SP | Mô tả tóm tắt |
| :--- | :--- | :---: | :---: | :--- |
| **S28-T1** | Migration DB & Model: Bổ sung Roles, Deactivation flags & Bảng Audit Log | Backend DB | 0.5 | Thêm roles `ticket_checker`, `accountant`; thêm `deactivated_at`, `deactivated_by` vào `users`; tạo bảng `role_change_logs`; cập nhật models `Role`, `User`, `RoleChangeLog`. |
| **S28-T2** | Real-time Role Sync & Deactivation check trong Middleware & Auth | Backend Core | 0.5 | Cập nhật `authMiddleware.js` để sync role tươi từ DB theo thời gian thực; cập nhật `authController.login` trả đúng thông báo liên hệ quản trị khi tài khoản bị vô hiệu hóa (AC2, AC3). |
| **S28-T3** | API Quản trị tài khoản nhân viên, gán vai trò & xem lịch sử kiểm toán | Backend API | 0.75 | Triển khai các endpoint `/api/admin/users`, `/api/admin/users/:id/role`, `/api/admin/users/:id/status`, `/api/admin/role-change-logs` kèm kiểm tra quyền admin và ghi log (NFR-1). |
| **S28-T4** | Giao diện Quét vé (`/scanner`) & Điều hướng phân quyền nghiêm ngặt cho Soát vé | Frontend UX | 0.5 | Tạo `TicketScannerPage.jsx`, cấu hình `PrivateRoute` và `Header` để nhân viên soát vé chỉ thấy và chỉ truy cập được màn hình soát vé (AC1). |
| **S28-T5** | Màn hình Quản lý nhân viên & Phân quyền trên Admin Dashboard | Frontend UI | 0.5 | Bổ sung tab Quản lý tài khoản trên `AdminDashboardPage.jsx`: danh sách người dùng, modal tạo tài khoản nhân viên, đổi vai trò trực tiếp, bật/tắt kích hoạt, tab xem audit logs. |
| **S28-T6** | Bộ kiểm thử tự động (Unit & Integration Tests) & Kiểm tra DoD | Testing / QA | 0.25 | Viết unit tests cho AC1, AC2, AC3, NFR-1; chạy lint và xác nhận build frontend/backend đạt Definition of Done. |

---

## 5. THIẾT KẾ KỸ THUẬT & API CONTRACTS

### 5.1. Danh mục vai trò hoàn chỉnh (Roles)
| Role ID | Tên vai trò (`name`) | Mô tả nghiệp vụ |
| :---: | :--- | :--- |
| 1 | `admin` | Quản trị viên hệ thống - toàn quyền cấu hình, quản lý người dùng và sự kiện |
| 2 | `organizer` | Ban tổ chức - tạo và quản lý sự kiện, sơ đồ ghế, suất diễn |
| 3 | `buyer` | Người mua vé - xem sự kiện, giữ chỗ và mua vé |
| 4 | `ticket_checker` | Nhân viên soát vé - quét QR/mã vé tại cửa check-in sự kiện |
| 5 | `accountant` | Kế toán - xem và đối soát báo cáo doanh thu, đơn hàng thanh toán |

### 5.2. Database Schema
```sql
-- Thêm cột vào bảng users
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL;

-- Bảng lưu lịch sử thay đổi vai trò (NFR-1)
CREATE TABLE IF NOT EXISTS role_change_logs (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  old_role VARCHAR(50) NULL,
  new_role VARCHAR(50) NULL,
  action VARCHAR(50) NOT NULL, -- 'ROLE_CHANGE', 'DEACTIVATE_USER', 'ACTIVATE_USER', 'CREATE_STAFF'
  reason VARCHAR(255) NULL,
  ip_address VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 5.3. Chi tiết API Endpoints
1. `GET /api/admin/users`: Lấy danh sách tài khoản (hỗ trợ search, filter role, filter status, phân trang).
2. `POST /api/admin/users`: Tạo tài khoản nhân viên nội bộ (`role` = `ticket_checker` | `accountant` | `organizer` | `admin`). Mật khẩu băm Argon2id, kích hoạt ngay `is_active: true`.
3. `PATCH /api/admin/users/:id/role`: Cập nhật vai trò tài khoản (`roleId` hoặc `roleName`), tự động ghi `role_change_logs`.
4. `PATCH /api/admin/users/:id/status`: Kích hoạt / Vô hiệu hóa tài khoản (`is_active: true/false`), tự động ghi `role_change_logs`.
5. `GET /api/admin/role-change-logs`: Lấy nhật ký thay đổi vai trò và phân quyền.
6. `POST /api/tickets/verify`: API soát vé (quyền: `admin`, `ticket_checker`).

---

## 6. DEFINITION OF DONE (DOD) CHECKLIST

- [x] Đã phân tách đầy đủ Sub-tasks và gán ước lượng Story Points (3 SP).
- [x] Migration Database bổ sung roles `ticket_checker`, `accountant` và bảng `role_change_logs`.
- [x] Backend `authMiddleware` đồng bộ vai trò tức thời từ DB (AC2 pass).
- [x] Backend `authController.login` từ chối kèm thông báo liên hệ quản trị khi tài khoản bị vô hiệu hóa (AC3 pass).
- [x] Backend Admin APIs tạo tài khoản, đổi vai trò, bật/tắt kích hoạt và ghi audit log (NFR-1 pass).
- [x] Frontend Header & PrivateRoute cô lập màn hình cho vai trò `ticket_checker` chỉ thấy `/scanner` (AC1 pass).
- [x] Giao diện Admin Dashboard hỗ trợ quản lý nhân viên, gán vai trò trực quan.
- [x] Màn hình Quét vé `/scanner` hoạt động mượt mà, hỗ trợ quét mã và nhập vé thủ công.
- [x] Unit test kiểm thử đầy đủ các nhánh logic mới (AC1, AC2, AC3, NFR-1).
- [x] Build và Lint thành công, không có secret trong mã nguồn.
