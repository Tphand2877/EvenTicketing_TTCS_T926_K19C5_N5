import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PrivateRoute from './routes/PrivateRoute'
import PaymentResultPage from './pages/PaymentResultPage'
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

// SCRUM-203: mock payment gateway page. Only exists when the flag is on,
// so it is left out of production builds (the dynamic import is dropped).
const MOCK_GATEWAY_ENABLED = import.meta.env.VITE_ENABLE_MOCK_GATEWAY === 'true'
const MockGatewayPage = MOCK_GATEWAY_ENABLED
  ? lazy(() => import('./pages/MockGatewayPage'))
  : null

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
<Route
  path="/payment-result"
  element={<PaymentResultPage />}
/>
          {/* ── Mock payment gateway (SCRUM-203, flag only) ──── */}
          {MOCK_GATEWAY_ENABLED && (
            <Route
              path="/mock-gateway"
              element={<Suspense fallback={null}><MockGatewayPage /></Suspense>}
            />
          )}

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
