import { useState } from 'react'

/**
 * RegisterForm – name, email, password, confirm password
 *
 * Props:
 *   onSubmit({ name, email, password }) : async fn → throws on error
 *   loading : boolean
 *   error   : string | null
 */
export default function RegisterForm({ onSubmit, loading, error }) {
  const [form, setForm]           = useState({ name: '', email: '', password: '', confirm: '' })
  const [showPass, setShowPass]   = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})

  const set = (field) => (e) => {
    setForm((p) => ({ ...p, [field]: e.target.value }))
    setFieldErrors((p) => ({ ...p, [field]: '' }))
  }

  const validate = () => {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Vui lòng nhập họ tên'
    if (!form.email.trim()) {
      errs.email = 'Email không được để trống'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'Email không hợp lệ'
    }
    if (!form.password) {
      errs.password = 'Mật khẩu không được để trống'
    } else if (form.password.length < 8) {
      errs.password = 'Mật khẩu tối thiểu 8 ký tự'
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(form.password)) {
      errs.password = 'Mật khẩu cần có chữ hoa, chữ thường và số'
    }
    if (form.confirm !== form.password) errs.confirm = 'Mật khẩu xác nhận không khớp'
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }
    setFieldErrors({})
    await onSubmit({ name: form.name, email: form.email, password: form.password })
  }

  const cls = (field) => `input-field ${fieldErrors[field] ? 'input-field-error' : ''}`

  // Password strength meter
  const strength = (() => {
    if (!form.password) return 0
    let s = 0
    if (form.password.length >= 8) s++
    if (/[A-Z]/.test(form.password)) s++
    if (/[0-9]/.test(form.password)) s++
    if (/[^A-Za-z0-9]/.test(form.password)) s++
    return s
  })()

  const strengthLabel = ['', 'Yếu', 'Trung bình', 'Mạnh', 'Rất mạnh'][strength]
  const strengthColor = ['', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-500'][strength]

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {/* API error */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3.5 text-sm text-red-700 animate-fade-in">
          <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="reg-name">
          Họ và tên
        </label>
        <input
          id="reg-name"
          type="text"
          autoComplete="name"
          placeholder="Nguyễn Văn A"
          value={form.name}
          onChange={set('name')}
          className={cls('name')}
        />
        {fieldErrors.name && <p className="mt-1 text-xs text-red-500">{fieldErrors.name}</p>}
      </div>

      {/* Email */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="reg-email">
          Email
        </label>
        <input
          id="reg-email"
          type="email"
          autoComplete="email"
          placeholder="ban@example.com"
          value={form.email}
          onChange={set('email')}
          className={cls('email')}
        />
        {fieldErrors.email && <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>}
      </div>

      {/* Password */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="reg-password">
          Mật khẩu
        </label>
        <div className="relative">
          <input
            id="reg-password"
            type={showPass ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="••••••••"
            value={form.password}
            onChange={set('password')}
            className={`${cls('password')} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowPass((p) => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
            tabIndex={-1}
          >
            {showPass
              ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
          </button>
        </div>

        {/* Strength meter */}
        {form.password && (
          <div className="mt-2">
            <div className="flex gap-1 mb-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= strength ? strengthColor : 'bg-gray-200'}`} />
              ))}
            </div>
            <p className={`text-xs font-medium ${['', 'text-red-500', 'text-orange-500', 'text-yellow-600', 'text-green-600'][strength]}`}>
              {strengthLabel}
            </p>
          </div>
        )}

        {fieldErrors.password && <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>}
      </div>

      {/* Confirm password */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="reg-confirm">
          Xác nhận mật khẩu
        </label>
        <div className="relative">
          <input
            id="reg-confirm"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="••••••••"
            value={form.confirm}
            onChange={set('confirm')}
            className={`${cls('confirm')} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowConfirm((p) => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
            tabIndex={-1}
          >
            {showConfirm
              ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
          </button>
        </div>
        {fieldErrors.confirm && <p className="mt-1 text-xs text-red-500">{fieldErrors.confirm}</p>}
      </div>

      {/* Terms */}
      <p className="text-xs text-gray-500">
        Bằng cách đăng ký, bạn đồng ý với{' '}
        <a href="#" className="text-pink-600 hover:underline font-medium">Điều khoản dịch vụ</a>
        {' '}và{' '}
        <a href="#" className="text-pink-600 hover:underline font-medium">Chính sách bảo mật</a>.
      </p>

      {/* Submit */}
      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Đang đăng ký…
          </>
        ) : 'Tạo tài khoản'}
      </button>
    </form>
  )
}
