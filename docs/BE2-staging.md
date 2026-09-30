# BE-2: staging cho Sprint 1

## Trạng thái và mục đích

Staging là bản chạy thử của cả ba phần: PostgreSQL, backend và frontend. Nhánh
`staging` là nơi GitHub Actions triển khai bản này trên máy Windows tự quản lý
của nhóm. `main` và các nhánh tính năng chỉ chạy kiểm tra CI; chúng không tự
triển khai.

Trên máy chạy staging, frontend mở ở `http://<địa-chỉ-máy>:8080`. Trình duyệt
gọi API qua cùng địa chỉ, ví dụ `/api/auth/login`; Nginx chuyển yêu cầu tới
backend trong Docker. Backend chỉ mở cổng 3000 trên chính máy staging. Cần
kiểm tra tường lửa và mạng của máy nếu thành viên khác không mở được cổng 8080.

## Chuẩn bị một lần trên máy staging

1. Cài Docker với `docker compose` và bảo đảm Docker đang chạy.
2. Kết nối GitHub Actions self-hosted runner trên máy Windows với nhãn
   `self-hosted`, `Windows`, `X64`.
3. Tạo ba GitHub Actions secrets cho repository:
   `STAGING_POSTGRES_DB`, `STAGING_POSTGRES_USER`,
   `STAGING_POSTGRES_PASSWORD`. Mật khẩu thật không được commit vào Git.
4. Bảo đảm cổng 8080 còn trống. Cổng 3000 chỉ được dùng trên máy staging.

Workflow chỉ chạy job `deploy-staging` sau khi năm job kiểm tra code và job
`staging-smoke` đạt, đồng thời có push vào nhánh `staging`. Job smoke dựng
Docker tạm thời trên máy GitHub và thử website cùng API qua Nginx. Job deploy
gọi `scripts/deploy-staging.ps1`. Script kiểm tra Docker,
build hai image, khởi động database, chạy migrations, cập nhật backend/frontend,
rồi kiểm tra hai container và hai địa chỉ HTTP.

## Đưa thay đổi từ nhánh cá nhân lên staging

1. BE-2 mở pull request cho T-02 và T-03 để nhóm xem phần CI và triển khai.
   Nhánh T-03 được tạo sau T-02, nên gộp T-02 trước để mỗi PR còn đúng phần
   việc của nó. Người có quyền duyệt mới gộp sau khi các bước kiểm tra đạt.
2. Đồng bộ code đã được duyệt sang nhánh `staging` bằng pull request. Kiểm tra
   nhánh `staging` có cả workflow mới, Compose mới và các commit ứng dụng cần
   chạy. Nếu có thay đổi staging của thành viên khác, giải quyết xung đột cùng
   người sửa phần đó trước khi gộp; không ghi đè file của họ.
3. Khi pull request vào `staging` được gộp, GitHub tạo một lần chạy CI do push
   vào `staging`. Năm job code và `staging-smoke` phải xanh trước; sau đó
   `deploy-staging` mới chạy trên máy Windows của nhóm. PR chỉ chạy kiểm tra,
   bản thân PR chưa triển khai.
4. BE-2 mở lần chạy đó, xác nhận `deploy-staging` xanh, rồi mở địa chỉ staging
   từ máy khác và thử một thao tác thật (ví dụ đăng nhập bằng tài khoản thử).
   Ghi lại commit, địa chỉ và kết quả để BE-1/FE cùng kiểm tra.

Compose dùng cùng tên project `eventticketing-staging` và volume PostgreSQL
`staging_postgres_data` với bản staging cũ, nên việc cập nhật ứng dụng giữ lại
dữ liệu đang có. Không dùng `docker compose down -v` trên máy staging.

## Chạy thủ công tại máy có Docker

Sao chép `.env.example` thành `.env` ở thư mục gốc và thay mật khẩu mẫu. File
`.env` đã được Git bỏ qua. Trong PowerShell, đứng tại thư mục gốc và chạy:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-staging.ps1
```

Kiểm tra frontend tại `http://localhost:8080` và backend tại
`http://localhost:3000/health`. Dùng tài khoản thử do nhóm tạo để đi qua một
luồng đăng nhập thực tế; endpoint `/health` chỉ chứng minh máy chủ đã phản hồi.

## Khi có lỗi

Mở GitHub → Actions → lần chạy CI tương ứng → `deploy-staging` để đọc bước đỏ.
Trên máy staging có thể xem thêm:

```powershell
docker compose -p eventticketing-staging -f docker-compose.staging.yml ps
docker compose -p eventticketing-staging -f docker-compose.staging.yml logs --tail 80 backend frontend postgres
```

Script lưu image ứng dụng cũ dưới tag `:rollback` trước khi build. Nếu cập nhật
container thất bại, nó thử phục hồi hai image cũ. Dữ liệu PostgreSQL nằm trong
volume `staging_postgres_data` và không bị xóa bởi lệnh triển khai. **Migration
database không tự đảo ngược**; nếu cần lùi schema, BE-1 phải kiểm tra migration
và dữ liệu trước khi chạy rollback database.

## Hỗ trợ K-01

Khi hỗ trợ BE-1 kiểm tra spike/tích hợp, BE-2 ghi lại: commit đang triển khai,
lần CI tương ứng, địa chỉ staging, kết quả `/health`, kết quả thao tác thật và
log lỗi nếu có. BE-1 quyết định logic/database; BE-2 giúp xác định lỗi xảy ra
trong CI, Docker, mạng hay lúc ứng dụng chạy.
