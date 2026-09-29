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

  // Restore session from localStorage on first mount
  useEffect(() => {
    const storedToken = getToken()
    const storedUser  = getStoredUser()

    if (storedToken) {
      setToken(storedToken)
      if (storedUser) {
        setUser(storedUser)
        setLoading(false)
      } else {
        // Attempt to refresh user from API
        apiClient.get('/auth/me')
          .then(({ data }) => {
            setUser(data.user ?? data)
            saveUser(data.user ?? data)
          })
          .catch(() => {
            setToken(null)
            authLogout()
          })
          .finally(() => setLoading(false))
      }
    } else {
      setLoading(false)
    }
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
