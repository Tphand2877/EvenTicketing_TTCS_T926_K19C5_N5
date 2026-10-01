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
  return data
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
 * Demo OAuth login – shows a mock response without a real provider
 * @param {'google'|'facebook'|'github'} provider
 */
export const loginWithProvider = async (provider) => {
  await new Promise((r) => setTimeout(r, 800))
  const mockUser = {
    id: 'demo-001',
    email: `demo@${provider}.com`,
    name: `Demo User (${provider})`,
    role: 'buyer',
    provider,
  }
  const mockToken = 'demo_jwt_token_' + Date.now()
  saveToken(mockToken)
  saveUser(mockUser)
  return { token: mockToken, user: mockUser }
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
