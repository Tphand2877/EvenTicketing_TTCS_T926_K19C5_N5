import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { sendMockPaymentResult } from '../services/mockGatewayService'

/**
 * Mock payment gateway page – SCRUM-203 (T-43), story S-19.
 *
 * Stands in for the real sandbox gateway. The backend redirects here with:
 *   /mock-gateway?orderId=...&amount=...&transactionId=...&returnUrl=/checkout
 * Clicking a button sends a signed webhook to the backend, then returns to returnUrl.
 *
 * Only registered in App.jsx when VITE_ENABLE_MOCK_GATEWAY === 'true'.
 * TODO(T-40/T-41): confirm the query parameter names with BE2.
 */

const formatMoney = (value) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)
    : '—'

// Only allow redirects inside the app (no open redirect).
const safeReturnUrl = (url) =>
  url && url.startsWith('/') && !url.startsWith('//') ? url : '/events'

export default function MockGatewayPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null) // 'SUCCESS' | 'FAILED' | null
  const [error, setError] = useState('')

  const orderId = params.get('orderId')
  const transactionId = params.get('transactionId') || undefined
  const amount = Number(params.get('amount'))
  const returnUrl = safeReturnUrl(params.get('returnUrl'))

  const submit = async (status) => {
    setBusy(status)
    setError('')
    try {
      await sendMockPaymentResult({ orderId, amount, status, transactionId })
      const sep = returnUrl.includes('?') ? '&' : '?'
      navigate(`${returnUrl}${sep}status=${status.toLowerCase()}`)
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Không gửi được kết quả thanh toán.')
      setBusy(null)
    }
  }

  if (!orderId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <p className="text-gray-600 text-center max-w-sm">
          Thiếu mã đơn hàng trong đường dẫn. Hãy quay lại trang thanh toán và thử lại.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-amber-100 text-amber-900 text-sm px-6 py-3">
          Cổng thanh toán giả lập. Chỉ dùng để thử nghiệm, không trừ tiền thật.
        </div>

        <div className="p-6">
          <h1 className="text-xl font-bold text-gray-900">Thanh toán đơn hàng</h1>

          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Mã đơn hàng</dt>
              <dd className="font-medium text-gray-900 break-all text-right">{orderId}</dd>
            </div>
            <div className="flex justify-between items-baseline">
              <dt className="text-gray-500">Số tiền</dt>
              <dd className="text-2xl font-bold text-primary-600">{formatMoney(amount)}</dd>
            </div>
          </dl>

          {error && (
            <p role="alert" className="mt-5 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="mt-6 grid gap-3">
            <button
              type="button"
              className="btn-primary disabled:opacity-60"
              disabled={busy !== null}
              onClick={() => submit('SUCCESS')}
            >
              {busy === 'SUCCESS' ? 'Đang gửi…' : 'Thanh toán thành công'}
            </button>
            <button
              type="button"
              className="w-full rounded-lg border border-red-300 text-red-700 font-medium py-2.5 hover:bg-red-50 disabled:opacity-60"
              disabled={busy !== null}
              onClick={() => submit('FAILED')}
            >
              {busy === 'FAILED' ? 'Đang gửi…' : 'Thanh toán thất bại'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
