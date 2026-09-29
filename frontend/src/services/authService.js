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
  // Expected: { token, user: { id, email, name, role } }
  saveToken(data.token)
  if (remember) {
    saveUser(data.user)
  }
  return data
}

/**
 * Demo OAuth login – shows a mock response without a real provider
 * @param {'google'|'facebook'|'github'} provider
 */
export const loginWithProvider = async (provider) => {
  // In a real app, redirect to backend OAuth URL:
  // window.location.href = `/api/auth/${provider}`
  //
  // For demo, return a mock user after a short delay
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
