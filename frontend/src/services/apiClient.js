import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ── Request interceptor: attach JWT ──────────────────────────────────────────
apiClient.interceptors.request.use(
  (config) => {
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
  (response) => response,
  (error) => {
    // Chỉ coi là "hết phiên" khi request có gửi token. Đăng nhập sai mật khẩu cũng trả 401
    // nhưng không có token -> để LoginPage tự hiển thị lỗi, không reload trang.
    const sentToken = !!error.config?.headers?.Authorization
    if (error.response?.status === 401 && sentToken) {
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
