import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})
let serverOffsetMs = 0

/** Thời điểm hiện tại theo giờ server (ms) */
export const getServerNow = () => Date.now() + serverOffsetMs

const syncServerClock = (response) => {
  const dateHeader = response.headers?.date
  const sentAt = response.config?.metadata?.sentAt
  if (!dateHeader || !sentAt) return
  const serverMs = new Date(dateHeader).getTime()
  if (Number.isNaN(serverMs)) return
  // Lấy điểm giữa lúc gửi và lúc nhận để bù độ trễ mạng.
  // Header Date chỉ chính xác tới giây (bị làm tròn xuống) nên cộng thêm 500ms.
  const clientMid = (sentAt + Date.now()) / 2
  serverOffsetMs = serverMs + 500 - clientMid
}

// ── Request interceptor: attach JWT ──────────────────────────────────────────
apiClient.interceptors.request.use(
  (config) => {
      config.metadata = { sentAt: Date.now() }
    const token = localStorage.getItem('et_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// ── Response interceptor: handle 401 ─────────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => {
    syncServerClock(response)
    return response
  },
  (error) => {
    // Chỉ coi là "hết phiên" khi request có gửi token. Đăng nhập sai mật khẩu cũng trả 401
    // nhưng không có token -> để LoginPage tự hiển thị lỗi, không reload trang.
    // skipAuthRedirect: request tự xử lý 401 (VD AuthContext kiểm tra token lúc mở web).
    const sentToken = !!error.config?.headers?.Authorization
    if (error.response?.status === 401 && sentToken && !error.config?.skipAuthRedirect) {
      localStorage.removeItem('et_token')
      localStorage.removeItem('et_user')
      // Redirect to login preserving the current path (không redirect nếu đang ở trang login)
      if (!window.location.pathname.startsWith('/login')) {
        const returnTo = encodeURIComponent(window.location.pathname)
        window.location.href = `/login?returnTo=${returnTo}`
      }
    }
    return Promise.reject(error)
  },
)

export default apiClient