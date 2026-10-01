import { useState } from 'react'
import { Link } from 'react-router-dom'
import RegisterForm from '../components/auth/RegisterForm'
import VerifyEmailNotice from '../components/auth/VerifyEmailNotice'
import apiClient from '../services/apiClient'

export default function RegisterPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [verified, setVerified] = useState(null) // email after success

  const handleRegister = async ({ name, email, password }) => {
    setError(null)
    setLoading(true)
    try {
      await apiClient.post('/auth/register', { name, email, password })
      setVerified(email)
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Đăng ký thất bại'
      const vi = {
        'Email already exists': 'Email này đã được sử dụng.',
      }
      setError(vi[msg] ?? msg)
    } finally {
      setLoading(false)
    }
  }

  if (verified) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-auth-pattern">
        <div className="w-full max-w-md card-auth animate-slide-up">
          <VerifyEmailNotice email={verified} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      {/* LEFT hero (desktop) */}
      <div className="hidden lg:flex lg:w-5/12 relative overflow-hidden bg-gray-900">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-900 via-purple-900 to-pink-900" />
        <div className="absolute top-1/3 left-1/4 w-56 h-56 bg-violet-600/30 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-40 h-40 bg-pink-600/30 rounded-full blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between p-10 text-white w-full">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center border border-white/30">
              <span className="font-bold">ET</span>
            </div>
            <span className="text-lg font-bold">EvenTicketing</span>
          </Link>

          <div className="space-y-4">
            <h1 className="text-3xl xl:text-4xl font-bold leading-tight">
              Tham gia cộng đồng
              <span className="block mt-1 bg-gradient-to-r from-pink-300 to-orange-300 bg-clip-text text-transparent">
                hàng triệu người yêu sự kiện
              </span>
            </h1>
            <p className="text-white/70 leading-relaxed max-w-xs">
              Tạo tài khoản miễn phí và bắt đầu hành trình khám phá những sự kiện tuyệt vời.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              {[
                { icon: '🎵', label: 'Âm nhạc' },
                { icon: '⚽', label: 'Thể thao' },
                { icon: '🎭', label: 'Nghệ thuật' },
                { icon: '💻', label: 'Công nghệ' },
              ].map(({ icon, label }) => (
                <div key={label} className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2 text-sm">
                  <span>{icon}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-white/40 text-xs">
            Bảo mật thông tin · Không spam
          </p>
        </div>
      </div>

      {/* RIGHT: Form */}
      <div className="flex-1 flex flex-col">
        <div className="lg:hidden flex items-center gap-2 p-6 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">ET</span>
          </div>
          <span className="font-bold text-gray-900">EvenTicketing</span>
        </div>

        <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-auth-pattern">
          <div className="w-full max-w-md animate-slide-up">
            <div className="card-auth">
              <div className="mb-6 text-center">
                <h2 className="text-2xl font-bold text-gray-900">Tạo tài khoản mới</h2>
                <p className="text-gray-500 text-sm mt-1">Miễn phí · Nhanh chóng · An toàn</p>
              </div>

              <RegisterForm onSubmit={handleRegister} loading={loading} error={error} />

              <p className="text-center text-sm text-gray-500 mt-6">
                Đã có tài khoản?{' '}
                <Link to="/login" className="font-semibold text-pink-600 hover:text-pink-700 transition-colors">
                  Đăng nhập
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
