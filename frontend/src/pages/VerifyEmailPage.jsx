import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { verifyEmail, resendVerification } from '../services/authService'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState(false)
  const [message, setMessage] = useState('')
  const [expired, setExpired] = useState(false)
  const [canResend, setCanResend] = useState(false)
  const [email, setEmail] = useState('')
  const [resending, setResending] = useState(false)
  const [resendStatus, setResendStatus] = useState(null)

  useEffect(() => {
    let isMounted = true

    async function checkVerification() {
      if (!token) {
        if (isMounted) {
          setLoading(false)
          setSuccess(false)
          setMessage('Không tìm thấy mã kích hoạt trong đường dẫn.')
          setCanResend(true)
        }
        return
      }

      try {
        const res = await verifyEmail(token)
        if (isMounted) {
          setLoading(false)
          setSuccess(true)
          setMessage(res.message || 'Tài khoản của bạn đã được kích hoạt thành công!')
        }
      } catch (err) {
        if (isMounted) {
          setLoading(false)
          setSuccess(false)
          const data = err.response?.data
          setMessage(data?.message || err.message || 'Xác nhận email thất bại.')
          if (data?.expired) {
            setExpired(true)
          }
          if (data?.canResend) {
            setCanResend(true)
          }
          if (data?.email) {
            setEmail(data.email)
          }
        }
      }
    }

    checkVerification()
    return () => {
      isMounted = false
    }
  }, [token])

  const handleResend = async (e) => {
    e.preventDefault()
    if (!email.trim() || resending) return
    setResending(true)
    setResendStatus(null)

    try {
      const res = await resendVerification(email.trim())
      setResendStatus({
        success: true,
        message: res.message || 'Liên kết kích hoạt mới đã được gửi vào hòm thư của bạn.',
      })
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Gửi lại email thất bại. Vui lòng thử lại sau.'
      setResendStatus({
        success: false,
        message: msg,
      })
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-auth-pattern">
      <div className="w-full max-w-md animate-slide-up">
        <div className="card-auth text-center py-8 px-6">
          {/* Brand */}
          <div className="flex justify-center mb-6">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-base">ET</span>
              </div>
              <span className="text-xl font-bold text-gray-900">EvenTicketing</span>
            </Link>
          </div>

          {/* Loading */}
          {loading && (
            <div className="space-y-4 py-8">
              <div className="flex justify-center">
                <svg className="animate-spin h-10 w-10 text-pink-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <p className="text-gray-600 font-medium">Đang xác thực liên kết kích hoạt…</p>
            </div>
          )}

          {/* Success */}
          {!loading && success && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Kích hoạt thành công!</h2>
                <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
              </div>
              <Link to="/login" className="btn-primary inline-flex justify-center items-center gap-2 w-full">
                <span>Đăng nhập ngay</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </div>
          )}

          {/* Failure / Expired */}
          {!loading && !success && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex justify-center">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center ${expired ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
                  {expired ? (
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {expired ? 'Liên kết đã hết hạn' : 'Kích hoạt không thành công'}
                </h2>
                <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
              </div>

              {/* Resend form (AC4) */}
              {canResend && (
                <div className="pt-2 border-t border-gray-100 space-y-4 text-left">
                  <h3 className="text-sm font-semibold text-gray-900">Yêu cầu gửi lại liên kết kích hoạt mới:</h3>

                  {resendStatus && (
                    <div className={`text-sm p-3 rounded-xl ${resendStatus.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                      {resendStatus.message}
                    </div>
                  )}

                  <form onSubmit={handleResend} className="space-y-3">
                    <input
                      type="email"
                      required
                      placeholder="Nhập email của bạn"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input-field"
                    />
                    <button
                      type="submit"
                      disabled={resending || !email.trim()}
                      className="btn-primary w-full"
                    >
                      {resending ? 'Đang gửi lại…' : 'Gửi lại liên kết kích hoạt'}
                    </button>
                  </form>
                </div>
              )}

              <div className="pt-3">
                <Link to="/login" className="text-sm text-pink-600 hover:text-pink-700 font-medium hover:underline">
                  Quay lại đăng nhập
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
