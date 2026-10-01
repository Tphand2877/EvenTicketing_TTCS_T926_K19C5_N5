import { Link } from 'react-router-dom'

/**
 * Shown after successful registration — prompts user to verify their email.
 *
 * Props:
 *   email : string
 */
export default function VerifyEmailNotice({ email }) {
  return (
    <div className="text-center space-y-5 py-4 animate-slide-up">
      {/* Icon */}
      <div className="flex justify-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-100 to-pink-100 flex items-center justify-center">
          <svg className="w-10 h-10 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
      </div>

      {/* Heading */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Kiểm tra email của bạn!</h2>
        <p className="text-sm text-gray-500">
          Chúng tôi đã gửi link xác nhận đến
        </p>
        <p className="font-semibold text-pink-600 mt-0.5 text-sm">{email}</p>
      </div>

      {/* Steps */}
      <div className="bg-gray-50 rounded-xl p-4 text-left space-y-3">
        {[
          'Mở email vừa nhận',
          'Nhấn vào nút "Xác nhận tài khoản"',
          'Đăng nhập và bắt đầu mua vé!',
        ].map((step, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">{i + 1}</span>
            </div>
            <p className="text-sm text-gray-600">{step}</p>
          </div>
        ))}
      </div>

      {/* Resend */}
      <p className="text-sm text-gray-500">
        Không thấy email?{' '}
        <button className="text-pink-600 hover:text-pink-700 font-medium hover:underline">
          Gửi lại
        </button>
      </p>

      {/* Back to login */}
      <Link
        to="/login"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Quay lại đăng nhập
      </Link>
    </div>
  )
}
