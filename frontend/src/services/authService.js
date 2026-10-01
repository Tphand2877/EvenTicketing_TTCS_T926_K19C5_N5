import apiClient from './apiClient'

const TOKEN_KEY = 'et_token'
const USER_KEY  = 'et_user'

// ── Token helpers ─────────────────────────────────────────────────────────────
export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const saveToken = (token) => localStorage.setItem(TOKEN_KEY, token)
export const removeToken = () => localStorage.removeItem(TOKEN_KEY)

export const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY))
  } catch {
    return null
  }
}
export const saveUser = (user) => localStorage.setItem(USER_KEY, JSON.stringify(user))
export const removeUser = () => localStorage.removeItem(USER_KEY)

// ── API calls ─────────────────────────────────────────────────────────────────

/**
 * Login with email & password
 * @param {string} email
 * @param {string} password
 * @param {boolean} remember
 */
export const login = async (email, password, remember = false) => {
  const { data } = await apiClient.post('/auth/login', { email, password })
  const token = data?.data?.accessToken || data?.token
  const user = data?.data?.user || data?.user
  if (token) saveToken(token)
  if (remember && user) {
    saveUser(user)
  }
  // Trả về cùng dạng { token, user } với loginWithProvider để AuthContext.login dùng được
  return { token, user }
}

/**
 * Register buyer account (SCRUM-76)
 * @param {{ name?: string, email: string, password: string }} userData
 */
export const register = async ({ name, email, password }) => {
  const { data } = await apiClient.post('/auth/register', {
    name,
    email,
    password,
  })
  return data
}

/**
 * Verify account using token from email (SCRUM-76 AC4)
 * @param {string} token
 */
export const verifyEmail = async (token) => {
  const { data } = await apiClient.get('/auth/verify-email', {
    params: { token },
  })
  return data
}

/**
 * Resend activation email (SCRUM-76 AC4, NFR rate limit)
 * @param {string} email
 */
export const resendVerification = async (email) => {
  const { data } = await apiClient.post('/auth/resend-verification', { email })
  return data
}

/**
 * Đăng nhập Google/Facebook: backend CHƯA hỗ trợ OAuth.
 * Trước đây hàm này tạo token giả -> giao diện tưởng đã đăng nhập nhưng mọi API cần
 * đăng nhập (giữ chỗ...) đều bị 401 và người dùng bị đá ra trang login.
 * @param {'google'|'facebook'|'github'} provider
 */
export const loginWithProvider = async (_provider) => {
  throw new Error('OAuth chưa được hỗ trợ')
}

/**
 * Fetch current authenticated user from API
 */
export const getMe = async () => {
  const { data } = await apiClient.get('/auth/me')
  return data
}

/**
 * Clear session
 */
export const logout = () => {
  removeToken()
  removeUser()
}
