import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * PrivateRoute – wraps children with authentication + optional role check.
 *
 * Usage:
 *   <Route element={<PrivateRoute />}>
 *     <Route path="/events" element={<EventListPage />} />
 *   </Route>
 *
 *   <Route element={<PrivateRoute roles={['admin']} />}>
 *     <Route path="/admin" element={<AdminPage />} />
 *   </Route>
 *
 * Props:
 *   children : ReactNode (preferred) or use as outlet wrapper
 *   roles    : string[] – allowed roles (optional)
 *   fallback : JSX – loading UI (optional)
 */
import { Outlet } from 'react-router-dom'

export default function PrivateRoute({ children, roles = [] }) {
  const { isAuthenticated, user, loading } = useAuth()
  const location = useLocation()

  // Still restoring session from storage – show spinner
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-pink-200 border-t-pink-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Đang tải…</p>
        </div>
      </div>
    )
  }

  // Not authenticated → redirect to login
  if (!isAuthenticated) {
    const returnTo = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />
  }

  // Role check (if roles specified)
  if (roles.length > 0 && !roles.includes(user?.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Không có quyền truy cập</h2>
          <p className="text-gray-500 text-sm mb-5">
            Trang này yêu cầu quyền: <strong>{roles.join(', ')}</strong>.
            Tài khoản của bạn là: <strong>{user?.role || 'không xác định'}</strong>.
          </p>
          <a href="/events" className="btn-primary inline-block">
            Về trang chủ
          </a>
        </div>
      </div>
    )
  }

  // Render children or outlet
  return children ?? <Outlet />
}
