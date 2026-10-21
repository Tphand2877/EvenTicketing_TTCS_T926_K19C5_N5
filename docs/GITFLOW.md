# Quy trình Git Flow của nhóm

Mentor yêu cầu dùng `develop` làm nhánh tích hợp. Áp dụng từ đợt chuyển đổi tháng 10/2026.

## Nhánh và đích PR

| Nhánh | Tạo từ | Mở PR vào |
| --- | --- | --- |
| `feature/SCRUM-xxx-mo-ta` | `develop` mới nhất | `develop` |
| `fix/*`, `bugfix/*` | `develop` | `develop` |
| `chore/*`, `ci/*`, `docs/*`, `test/*`, `refactor/*` | `develop` | `develop` |
| `release/sprint-3` hoặc `release/vX.Y.Z` | `develop` đã ổn định | `main` |
| `hotfix/*` | `main` | `main`, sau đó đồng bộ `main` về `develop` |
| `main` (đồng bộ sau phát hành/hotfix) | nhánh có sẵn | `develop` |

Không mở PR từ feature trực tiếp vào `main`. Không commit trực tiếp, force-push hoặc reset
`main`/`develop`. Không dùng một nhánh feature làm nhánh tích hợp lâu dài. Nếu task phụ thuộc
PR khác chưa merge, ghi rõ dependency và retarget về `develop` khi dependency đã được merge.

## Làm một task

```sh
git fetch origin
git switch develop
git pull --ff-only origin develop
git switch -c feature/SCRUM-xxx-mo-ta
# Sửa code, chạy các kiểm tra liên quan, commit.
git push -u origin feature/SCRUM-xxx-mo-ta
# Tạo PR: base = develop.
```

Nếu `develop` local bị lệch, kiểm tra và giữ lại commit local trước khi xử lý; không chạy reset
để đồng bộ một cách máy móc. PR phải liên kết Jira, mô tả hành vi cuối cùng và bằng chứng kiểm thử.
CI build/lint/test phải đạt và ít nhất một thành viên khác duyệt. Sau merge, xoá nhánh task nếu
không còn PR phụ thuộc. Merge code chưa có nghĩa toàn bộ story đạt DoD hoặc đã nghiệm thu staging.

## Staging và phát hành

- CI chạy cho `main`, `develop`, các nhánh task, release và hotfix; PR chạy vào `main`/`develop`.
- `deploy-staging` chỉ chạy sau khi cả năm job CI đạt trên một lần **push vào develop**.
  Các PR và push vào `main` không tự triển khai staging. Job deploy được xếp tuần tự.
- Deploy dùng self-hosted runner có nhãn `Windows`, `X64`, Docker và script
  `scripts/deploy-staging.ps1`. Các secret `STAGING_POSTGRES_DB`, `STAGING_POSTGRES_USER`,
  `STAGING_POSTGRES_PASSWORD` phải tồn tại. Không có runner/secret thì chưa thể xác nhận staging.
- Chốt phạm vi sprint và kiểm thử staging trước khi tạo `release/*`. Chỉ đưa sửa lỗi cần thiết
  vào nhánh release, chạy CI, được duyệt rồi merge vào `main`. Gắn tag phiên bản vào commit phát hành.
- Sau phát hành hoặc hotfix, mở PR `main` → `develop` để đưa mọi sửa lỗi quay về nhánh tích hợp.
  Đây là trường hợp đồng bộ hợp lệ, không phải cách đưa feature vào `main`.

## Thiết lập GitHub do chủ repo thực hiện

Sau khi bản chuyển đổi và workflow đã được review/merge:

1. Đặt default branch là `develop` để PR tính năng mới mặc định chọn đúng đích.
2. Bảo vệ cả `main` và `develop`: bắt buộc PR, ít nhất một approval, giải quyết mọi trao đổi,
   bỏ approval cũ khi có commit mới, chặn force-push/xoá nhánh; hạn chế quyền bypass.
3. Bắt buộc các status check: `backend-build`, `backend-lint`, `backend-test`, `frontend-build`,
   `frontend-lint` và `Branch policy`. Chọn các check sau khi GitHub đã ghi nhận lần chạy đầu.
   Không đặt `deploy-staging` làm check bắt buộc trên PR vì nó chỉ chạy sau merge vào `develop`.
4. Xác nhận runner staging online, secrets đầy đủ, deploy thành công và AC pass trước khi báo Done.

`gitflow.yml` dùng `pull_request_target`, chỉ đọc metadata và chạy script inline từ nhánh đích.
Nó không checkout/chạy code của PR và chỉ có quyền đọc contents. Khi chính workflow chưa có trên
nhánh đích, PR bootstrap chưa được nó kiểm tra; cần review thủ công. Sau khi merge, bật check bắt buộc
để ngăn bỏ qua chính sách. Workflow không thay thế branch protection hoặc review của đồng đội.

## Đợt chuyển đổi hiện tại

- `main` tại thời điểm bắt đầu: `bebbd9f`; `develop`: `33ebf21`.
- `develop` có riêng S-10/PR #32; `main` có nhiều thay đổi mới. Bản đồng bộ phải giữ cả hai lịch sử,
  giải quyết conflict và chạy lại kiểm thử; không reset/force-push develop về main.
- Các conflict S-10 được hợp nhất với API import/mở bán, UI có zoom, server clock và bỏ từng ghế
  trên main. Test fixture dùng schema T-11/T-15 thật, không tạo lại các bảng đã tồn tại.
- Các PR đang mở #34, #37, #41, #43, #46, #47 cần base `develop`. Đổi base không đồng nghĩa merge
  hoặc xác nhận code của các PR đó; tác giả vẫn phải giải quyết conflict và kiểm tra lại diff/CI.
- Đưa cùng chính sách workflow vào `main` bằng một PR `release/*` chỉ chứa cấu hình/tài liệu,
  để chặn PR tính năng vào main mà không phát hành thêm tính năng. Chủ repo review PR bootstrap đó.
- Nhánh `feature/setup-gitflow` cũ là bản thử chưa merge; không merge mù quáng sau chuyển đổi.
