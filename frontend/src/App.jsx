import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PrivateRoute from './routes/PrivateRoute'

// Pages
import LoginPage       from './pages/LoginPage'
import RegisterPage    from './pages/RegisterPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import EventListPage   from './pages/EventListPage'
import EventDetailPage from './pages/EventDetailPage'
import ShowtimeDetailPage from './pages/ShowtimeDetailPage'
import CheckoutPage    from './pages/CheckoutPage'
import OrganizerDashboardPage from './pages/OrganizerDashboardPage'
import AdminDashboardPage from './pages/AdminDashboardPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ── Public routes ────────────────────────────────── */}
          <Route path="/login"        element={<LoginPage />} />
          <Route path="/register"     element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />

          {/* ── Root redirect ────────────────────────────────── */}
          <Route path="/" element={<Navigate to="/events" replace />} />

          {/* ── Public browsing routes ───────────────────────── */}
          <Route path="/events"         element={<EventListPage />} />
          <Route path="/events/:id"     element={<EventDetailPage />} />
          <Route path="/showtimes/:id" element={<ShowtimeDetailPage />} />


          {/* ── Protected routes (login required) ───────────── */}
          <Route element={<PrivateRoute />}>
            <Route path="/checkout" element={<CheckoutPage />} />
          </Route>

          {/* ── Organizer-only routes ────────────────────────── */}
          <Route element={<PrivateRoute roles={['organizer', 'admin']} />}>
            {/* SCRUM-80: quản lý sự kiện & suất diễn */}
            <Route path="/organizer" element={<OrganizerDashboardPage />} />
          </Route>

          {/* ── Admin-only routes ─────────────────────────────── */}
          <Route element={<PrivateRoute roles={['admin']} />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
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
