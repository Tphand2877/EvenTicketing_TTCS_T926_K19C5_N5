import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import {
  getToken,
  getStoredUser,
  saveToken,
  saveUser,
  logout as authLogout,
} from '../services/authService'
import apiClient from '../services/apiClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null)
  const [token, setToken]   = useState(null)
  const [loading, setLoading] = useState(true)

  // Restore session from localStorage on first mount, rồi hỏi lại server xem token còn hợp lệ không.
  // Nếu không (token giả, hết hạn, đổi JWT_SECRET...) thì đăng xuất âm thầm, để người dùng
  // không bị "tưởng đã đăng nhập" rồi bị đá ra trang login giữa chừng (VD lúc giữ chỗ).
  useEffect(() => {
    const storedToken = getToken()
    if (!storedToken || storedToken === 'undefined' || storedToken === 'null') {
      authLogout()
      setLoading(false)
      return
    }

    setToken(storedToken)
    setUser(getStoredUser())

    apiClient.get('/auth/me', { skipAuthRedirect: true })
      .then(({ data }) => {
        const me = data?.data ?? data?.user
        if (me) {
          setUser(me)
          saveUser(me)
        }
      })
      .catch((err) => {
        // Chỉ đăng xuất khi server từ chối token; lỗi mạng thì giữ phiên hiện tại
        if (err.response?.status === 401 || err.response?.status === 404) {
          setToken(null)
          setUser(null)
          authLogout()
        }
      })
      .finally(() => setLoading(false))
  }, [])

  /**
   * Called after a successful login/OAuth flow.
   * @param {{ token: string, user: object }} payload
   */
  const login = useCallback(({ token: t, user: u }) => {
    saveToken(t)
    saveUser(u)
    setToken(t)
    setUser(u)
  }, [])

  const logout = useCallback(() => {
    authLogout()
    setToken(null)
    setUser(null)
  }, [])

  const value = { user, token, loading, login, logout, isAuthenticated: !!token }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
