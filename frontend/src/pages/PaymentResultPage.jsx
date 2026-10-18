import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'
import { getPaymentStatus } from '../services/paymentStatusService'

const POLL_INTERVAL = 2000
const MAX_WAIT = 60000
// Trạng thái server đã kết luận: dừng hỏi lại
const FINAL = new Set(['paid', 'failed', 'expired', 'cancelled', 'needs_review'])

const VIEW = {
  checking: {
    title: 'Đang xác nhận thanh toán',
    message: 'Vui lòng chờ trong khi hệ thống nhận kết quả từ cổng thanh toán.',
  },
  paid: {
    title: 'Thanh toán thành công',
    message: 'Máy chủ đã xác nhận thanh toán. Vé của bạn đã được giữ chắc chắn.',
  },
  // S-24: thanh toán thất bại, đơn vẫn ở trạng thái chờ và ghế vẫn được giữ đến khi hết hạn
  failed: {
    title: 'Thanh toán chưa thành công',
    message: 'Cổng thanh toán báo giao dịch thất bại và chưa trừ tiền. Đơn hàng vẫn chờ thanh toán, ghế vẫn được giữ đến khi hết thời hạn.',
  },
  expired: {
    title: 'Đơn hàng đã hết hạn',
    message: 'Đã quá thời hạn thanh toán, ghế đã được nhả cho người khác. Vui lòng chọn ghế lại.',
  },
  cancelled: {
    title: 'Đơn hàng đã bị hủy',
    message: 'Đơn hàng này không còn hiệu lực. Vui lòng chọn ghế lại.',
  },
  needs_review: {
    title: 'Giao dịch đang được đối soát',
    message: 'Hệ thống cần kiểm tra thêm giao dịch này. Không thanh toán lại; bộ phận hỗ trợ sẽ liên hệ với bạn.',
  },
  timeout: {
    title: 'Chưa nhận được kết quả',
    message: 'Chưa có xác nhận từ máy chủ. Giao dịch CHƯA được kết luận là thất bại, vui lòng không thanh toán lại ngay. Tải lại trang sau ít phút để kiểm tra.',
  },
  missing: {
    title: 'Không tìm thấy đơn hàng',
    message: 'Đường dẫn không có mã đơn hàng.',
  },
}

/**
 * S-22 / T-51: trang kết quả chờ SERVER xác nhận, không tin tham số trên đường dẫn trả về
 * (vd. ?resultCode=0 của MoMo). Hỏi trạng thái mỗi 2 giây, tối đa 60 giây.
 */
export default function PaymentResultPage() {
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('orderId')
  const [status, setStatus] = useState(orderId ? 'checking' : 'missing')

  useEffect(() => {
    if (!orderId) return undefined
    let active = true
    let timerId
    let controller
    const startTime = Date.now()

    const check = async () => {
      if (!active) return
      const remaining = MAX_WAIT - (Date.now() - startTime)
      if (remaining <= 0) {
        setStatus('timeout')
        return
      }
      controller = new AbortController()
      const abortId = setTimeout(() => controller.abort(), remaining)
      try {
        const payment = await getPaymentStatus(orderId, { signal: controller.signal })
        if (!active) return
        if (FINAL.has(payment?.status)) {
          setStatus(payment.status)
          return
        }
      } catch (error) {
        if (!active) return
        // Đơn không thuộc người dùng / không tồn tại: không hỏi tiếp
        if ([403, 404].includes(error?.response?.status)) {
          setStatus('missing')
          return
        }
        // Lỗi mạng: thử lại nếu còn thời gian
      } finally {
        clearTimeout(abortId)
      }
      if (!active) return
      const left = MAX_WAIT - (Date.now() - startTime)
      if (left <= 0) {
        setStatus('timeout')
        return
      }
      timerId = setTimeout(check, Math.min(POLL_INTERVAL, left))
    }

    check()
    return () => {
      active = false
      clearTimeout(timerId)
      controller?.abort()
    }
  }, [orderId])

  const view = VIEW[status]

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-16">
        <section className="card-auth text-center space-y-4" aria-labelledby="payment-result-title">
          <h1 id="payment-result-title" className="text-2xl font-bold text-gray-900">{view.title}</h1>
          <p className="text-gray-600" aria-live="polite">{view.message}</p>

          {status === 'checking' && (
            <div className="animate-pulse text-pink-600" role="status" aria-live="polite">
              Đang kiểm tra đơn hàng...
            </div>
          )}

          {status !== 'checking' && (
            <Link to="/events" className="btn-primary inline-block">
              {['expired', 'cancelled'].includes(status) ? 'Chọn ghế lại' : 'Về trang sự kiện'}
            </Link>
          )}
        </section>
      </main>
      <Footer />
    </div>
  )
}
