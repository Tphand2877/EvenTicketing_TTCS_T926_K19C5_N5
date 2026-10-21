# Quy trình main và các nhánh tính năng (GitHub Flow)

`main` là nhánh mặc định và nơi tích hợp code của nhóm. Mỗi task có một nhánh ngắn hạn:
`main` → `feature/SCRUM-xxx-mo-ta` → pull request → `main`.
Các nhánh `fix/*`, `chore/*`, `docs/*`, `test/*` cũng tạo từ và mở PR vào `main`.

## Làm một task

```sh
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feature/SCRUM-xxx-mo-ta
# Sửa code, chạy các kiểm tra liên quan, commit.
git push -u origin feature/SCRUM-xxx-mo-ta
# Tạo PR với base = main, liên kết Jira và ghi kết quả kiểm thử.
```

CI build/lint/test phải đạt và ít nhất một thành viên khác duyệt trước khi merge.
Giải quyết mọi trao đổi review, kiểm tra diff chỉ chứa phần việc của task và xử lý conflict
khi `main` thay đổi. Nếu task phụ thuộc PR chưa merge, ghi rõ dependency trong mô tả PR.
Sau merge, xoá nhánh task khi các PR phụ thuộc đã được xử lý.

`main` được bảo vệ bằng yêu cầu PR/review; chủ repo cấu hình các kiểm tra CI bắt buộc
(`backend-build`, `backend-lint`, `backend-test`, `frontend-build`, `frontend-lint`) và chặn
force-push/xoá nhánh. PR đã merge vẫn cần đạt AC/DoD và nghiệm thu staging trước khi story Done.

## CI và môi trường kiểm thử

CI chạy khi push vào `main`/`feature/*` và cho PR vào `main`. Cấu hình hiện có còn hỗ trợ
nhánh triển khai kỹ thuật `staging`: push vào nhánh đó chỉ triển khai sau khi cả năm job CI đạt.
Nhánh này phục vụ môi trường kiểm thử; code hằng ngày được tích hợp bằng PR vào `main`.
Runner Windows, Docker và các secret staging tiếp tục theo cấu hình triển khai hiện có.

## Chuyển từ đề xuất develop

PR #48 đồng bộ `main`/`develop` được rút lại. PR #49 thay bằng hướng dẫn này và bỏ `develop`
khỏi các nhánh kích hoạt CI. Những PR từng được đổi base sang `develop` được trả về `main`.
Các nhánh cũ được giữ để bảo toàn code; phần code chỉ có trên `develop` cần PR riêng vào `main`
và được review theo đúng phạm vi, tránh đưa kèm vào PR của task khác.
