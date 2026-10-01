import { useState } from 'react'

/**
 * LoginForm – handles email/password login + social OAuth buttons
 *
 * Props:
 *   onSubmit(email, password, remember) : async fn → throws on error
 *   onSocial(provider)                  : async fn → throws on error
 *   loading                             : boolean
 *   error                               : string | null
 */
export default function LoginForm({ onSubmit, onSocial, loading, error }) {
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [remember, setRemember]   = useState(false)
  const [showPass, setShowPass]   = useState(false)
  const [socialLoading, setSocialLoading] = useState(null)
  const [fieldErrors, setFieldErrors]     = useState({})

  // ── Client-side validation ────────────────────────────────────────────────
  const validate = () => {
    const errs = {}
    if (!email.trim()) {
      errs.email = 'Email không được để trống'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = 'Email không hợp lệ'
    }
    if (!password) {
      errs.password = 'Mật khẩu không được để trống'
    } else if (password.length < 6) {
      errs.password = 'Mật khẩu tối thiểu 6 ký tự'
    }
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }
    setFieldErrors({})
    await onSubmit(email, password, remember)
  }

  const handleSocial = async (provider) => {
    setSocialLoading(provider)
    try {
      await onSocial(provider)
    } finally {
      setSocialLoading(null)
    }
  }

  const inputCls = (field) =>
    `input-field ${fieldErrors[field] ? 'input-field-error' : ''}`

  return (
    <div className="w-full space-y-5">
      {/* ── Social login ──────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Google */}
        <button
          type="button"
          onClick={() => handleSocial('google')}
          disabled={loading || !!socialLoading}
          className="btn-social"
        >
          {socialLoading === 'google' ? (
            <Spinner />
          ) : (
            <GoogleIcon />
          )}
          <span>Tiếp tục với Google</span>
        </button>

        {/* Facebook */}
        <button
          type="button"
          onClick={() => handleSocial('facebook')}
          disabled={loading || !!socialLoading}
          className="btn-social"
        >
          {socialLoading === 'facebook' ? (
            <Spinner />
          ) : (
            <FacebookIcon />
          )}
          <span>Tiếp tục với Facebook</span>
        </button>
      </div>

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <div className="relative flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 font-medium">hoặc đăng nhập bằng email</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* ── API error banner ──────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3.5 text-sm text-red-700 animate-fade-in">
          <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* ── Form ──────────────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="ban@example.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: '' })) }}
            className={inputCls('email')}
          />
          {fieldErrors.email && (
            <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>
          )}
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-gray-700" htmlFor="login-password">
              Mật khẩu
            </label>
            <a href="#" className="text-xs text-pink-600 hover:text-pink-700 font-medium">
              Quên mật khẩu?
            </a>
          </div>
          <div className="relative">
            <input
              id="login-password"
              type={showPass ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: '' })) }}
              className={`${inputCls('password')} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPass((p) => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
              tabIndex={-1}
              aria-label={showPass ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
            >
              {showPass ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          {fieldErrors.password && (
            <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>
          )}
        </div>

        {/* Remember me */}
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
          />
          <span className="text-sm text-gray-600">Nhớ tôi</span>
        </label>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !!socialLoading}
          className="btn-primary mt-1"
        >
          {loading ? (
            <>
              <Spinner white />
              Đang đăng nhập…
            </>
          ) : 'Đăng nhập'}
        </button>
      </form>
    </div>
  )
}

// ── Icon helpers ──────────────────────────────────────────────────────────────

function Spinner({ white = false }) {
  return (
    <svg
      className={`animate-spin h-4 w-4 shrink-0 ${white ? 'text-white' : 'text-gray-500'}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )
}
