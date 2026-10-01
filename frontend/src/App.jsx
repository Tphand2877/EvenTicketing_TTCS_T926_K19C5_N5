import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PrivateRoute from './routes/PrivateRoute'

// Pages
import LoginPage      from './pages/LoginPage'
import RegisterPage   from './pages/RegisterPage'
import EventListPage  from './pages/EventListPage'
import EventDetailPage from './pages/EventDetailPage'
import CheckoutPage   from './pages/CheckoutPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ── Public routes ────────────────────────────────── */}
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* ── Root redirect ────────────────────────────────── */}
          <Route path="/" element={<Navigate to="/events" replace />} />

          {/* ── Public browsing routes ───────────────────────── */}
          <Route path="/events"     element={<EventListPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />

          {/* ── Protected routes (login required) ───────────── */}
          <Route element={<PrivateRoute />}>
            <Route path="/checkout" element={<CheckoutPage />} />
          </Route>

          {/* ── Organizer-only routes ────────────────────────── */}
          <Route element={<PrivateRoute roles={['organizer', 'admin']} />}>
            {/* Placeholder – will be implemented in later sprints */}
            <Route path="/organizer" element={<div className="p-10 text-center text-gray-500">Organizer Dashboard – Coming Soon</div>} />
          </Route>

          {/* ── Admin-only routes ─────────────────────────────── */}
          <Route element={<PrivateRoute roles={['admin']} />}>
            <Route path="/admin" element={<div className="p-10 text-center text-gray-500">Admin Panel – Coming Soon</div>} />
          </Route>

          {/* ── 404 fallback ─────────────────────────────────── */}
          <Route path="*" element={
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
              <div className="text-8xl mb-4">😕</div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Trang không tồn tại</h1>
              <p className="text-gray-500 mb-6">Đường dẫn bạn tìm kiếm không tồn tại.</p>
              <a href="/events" className="btn-primary inline-block max-w-xs">
                Về trang chủ
              </a>
            </div>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
