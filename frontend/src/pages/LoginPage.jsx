import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { login as loginApi, loginWithProvider } from '../services/authService'
import LoginForm from '../components/auth/LoginForm'

// ── Decorative hero images (event photos) ────────────────────────────────────
const heroStats = [
  { label: 'Sự kiện', value: '500+' },
  { label: 'Người dùng', value: '50K+' },
  { label: 'Thành phố', value: '30+' },
]

export default function LoginPage() {
  const { login } = useAuth()
  const navigate   = useNavigate()
  const location   = useLocation()

  // Where to redirect after login
  const returnParam = new URLSearchParams(location.search).get('returnTo')
  const returnTo = returnParam && !returnParam.startsWith('/login') ? returnParam : '/events'

  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleLogin = async (email, password, remember) => {
    setError(null)
    setLoading(true)
    try {
      const data = await loginApi(email, password, remember)
      login(data)
      navigate(returnTo, { replace: true })
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Đăng nhập thất bại'
      // Map common backend error messages to Vietnamese
      const vi = {
        'Invalid credentials': 'Email hoặc mật khẩu không đúng.',
        'Account locked':
          'Tài khoản đã bị khóa do đăng nhập sai nhiều lần. Thử lại sau 30 phút.',
        'Account not verified':
          'Tài khoản chưa được xác nhận email. Vui lòng kiểm tra hộp thư đến.',
      }
      setError(vi[msg] ?? msg)
    } finally {
      setLoading(false)
    }
  }

  const handleSocial = async (provider) => {
    setError(null)
    try {
      const data = await loginWithProvider(provider)
      login(data)
      navigate(returnTo, { replace: true })
    } catch {
      setError(`Đăng nhập bằng ${provider[0].toUpperCase()}${provider.slice(1)} chưa được hỗ trợ. Vui lòng đăng nhập bằng email và mật khẩu.`)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── LEFT: Hero panel ─────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gray-900">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-900 via-purple-900 to-pink-900" />

        {/* Pattern overlay */}
        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        {/* Floating orbs */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-violet-600/30 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-pink-600/30 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-1/3 w-32 h-32 bg-orange-500/20 rounded-full blur-2xl" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          {/* Top: Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center border border-white/30">
              <span className="font-bold text-lg">ET</span>
            </div>
            <span className="text-xl font-bold">EvenTicketing</span>
          </div>

          {/* Middle: Headline */}
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 text-sm font-medium">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Nền tảng vé sự kiện #1 Việt Nam
              </div>
              <h1 className="text-4xl xl:text-5xl font-bold leading-tight">
                Khám phá và đặt vé
                <span className="block mt-1 bg-gradient-to-r from-pink-300 to-orange-300 bg-clip-text text-transparent">
                  sự kiện yêu thích
                </span>
              </h1>
              <p className="text-white/70 text-lg leading-relaxed max-w-sm">
                Âm nhạc, thể thao, nghệ thuật và hơn thế nữa – tất cả trong một ứng dụng.
              </p>
            </div>

            {/* Stats */}
            <div className="flex gap-8">
              {heroStats.map(({ label, value }) => (
                <div key={label}>
                  <div className="text-2xl font-bold">{value}</div>
                  <div className="text-white/60 text-sm">{label}</div>
                </div>
              ))}
            </div>

            {/* Feature list */}
            <ul className="space-y-2">
              {[
                'Đặt vé trong 60 giây',
                'Vé điện tử tích hợp QR code',
                'Hủy vé & hoàn tiền dễ dàng',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-white/80 text-sm">
                  <svg className="w-4 h-4 text-green-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Bottom: Testimonial */}
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex -space-x-2">
                {['V', 'N', 'T'].map((c) => (
                  <div key={c} className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-pink-400 flex items-center justify-center border-2 border-white/20 text-xs font-bold">
                    {c}
                  </div>
                ))}
              </div>
              <div className="flex text-yellow-400">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
            </div>
            <p className="text-white/80 text-sm italic">
              &ldquo;Giao diện đẹp, đặt vé nhanh và hỗ trợ 24/7. Tôi đã mua hơn 20 vé qua EvenTicketing!&rdquo;
            </p>
            <p className="text-white/50 text-xs mt-1">— Nguyễn Minh T., TP.HCM</p>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Form panel ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-2 p-6 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">ET</span>
          </div>
          <span className="font-bold text-gray-900">EvenTicketing</span>
        </div>

        {/* Scrollable form area */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-auth-pattern">
          <div className="w-full max-w-md animate-slide-up">
            {/* Card */}
            <div className="card-auth">
              {/* Heading */}
              <div className="mb-7 text-center">
                <h2 className="text-2xl font-bold text-gray-900">
                  Chào mừng trở lại 👋
                </h2>
                <p className="text-gray-500 text-sm mt-1">
                  Đăng nhập để tiếp tục khám phá sự kiện
                </p>
              </div>

              {/* Form */}
              {returnParam && !error && (
                <div className="mb-4 rounded-xl bg-blue-50 text-blue-700 text-sm px-4 py-3">
                  Vui lòng đăng nhập để tiếp tục. Sau khi đăng nhập bạn sẽ được đưa về trang trước đó.
                </div>
              )}
              <LoginForm
                onSubmit={handleLogin}
                onSocial={handleSocial}
                loading={loading}
                error={error}
              />

              {/* Register link */}
              <p className="text-center text-sm text-gray-500 mt-6">
                Chưa có tài khoản?{' '}
                <Link
                  to="/register"
                  className="font-semibold text-pink-600 hover:text-pink-700 transition-colors"
                >
                  Đăng ký miễn phí
                </Link>
              </p>
            </div>

            {/* Security note */}
            <p className="text-center text-xs text-gray-400 mt-4 flex items-center justify-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              Kết nối an toàn · Mã hóa SSL 256-bit
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
