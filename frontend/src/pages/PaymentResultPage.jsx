import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'
import { getOrderStatus } from '../services/orderService'

const POLL_INTERVAL = 2000
const MAX_WAIT = 60000

export default function PaymentResultPage() {
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('orderId')

  const [status, setStatus] = useState('checking')
  const [ticketUrl, setTicketUrl] = useState('')

  useEffect(() => {
    if (!orderId) {
      setStatus('timeout')
      return undefined
    }

    let active = true
    let timerId
    let requestController
    const startTime = Date.now()

    const checkStatus = async () => {
      if (!active) return

      const elapsed = Date.now() - startTime
      const remaining = MAX_WAIT - elapsed

      if (remaining <= 0) {
        setStatus('timeout')
        return
      }

      // Mỗi request không được kéo dài quá thời gian chờ còn lại.
      requestController = new AbortController()
      const requestTimeoutId = setTimeout(() => {
        requestController?.abort()
      }, remaining)

      try {
        const data = await getOrderStatus(orderId, {
          signal: requestController.signal,
        })

        if (!active) return

        // Chỉ tin trạng thái do server trả về.
        if (data?.status === 'paid') {
          setStatus('paid')
          setTicketUrl(data.ticketUrl || '')
          return
        }
      } catch (error) {
        if (!active) return

        // Lỗi mạng hoặc request bị hủy: tiếp tục thử nếu còn thời gian.
        if (error?.name !== 'AbortError') {
          console.error('Không thể kiểm tra trạng thái đơn hàng.')
        }
      } finally {
        clearTimeout(requestTimeoutId)
      }

      if (!active) return

      const elapsedAfterRequest = Date.now() - startTime
      const remainingAfterRequest = MAX_WAIT - elapsedAfterRequest

      if (remainingAfterRequest <= 0) {
        setStatus('timeout')
        return
      }

      timerId = setTimeout(
        checkStatus,
        Math.min(POLL_INTERVAL, remainingAfterRequest)
      )
    }

    // Bắt đầu kiểm tra ngay khi trang được mở.
    checkStatus()

    return () => {
      active = false
      clearTimeout(timerId)
      requestController?.abort()
    }
  }, [orderId])

  let title = 'Đang xác nhận thanh toán'
  let message =
    'Vui lòng chờ trong khi hệ thống kiểm tra giao dịch của bạn.'

  if (status === 'paid') {
    title = 'Thanh toán thành công'
    message = 'Đơn hàng đã được máy chủ xác nhận thanh toán.'
  } else if (status === 'timeout') {
    title = 'Hết thời gian chờ'
    message =
      'Chưa nhận được kết quả xác nhận. Giao dịch chưa được kết luận là thất bại. Vui lòng kiểm tra lịch sử đơn hàng trước khi thử thanh toán lại.'
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-16">
        <section
          className="card-auth text-center space-y-4"
          aria-labelledby="payment-result-title"
        >
          <h1
            id="payment-result-title"
            className="text-2xl font-bold text-gray-900"
          >
            {title}
          </h1>

          <p className="text-gray-600" aria-live="polite">
            {message}
          </p>

          {status === 'checking' && (
            <div
              className="animate-pulse text-pink-600"
              role="status"
              aria-live="polite"
            >
              Đang kiểm tra đơn hàng...
            </div>
          )}

          {status === 'paid' && ticketUrl && (
            <a
              href={ticketUrl}
              className="btn-primary inline-block"
            >
              Xem vé của tôi
            </a>
          )}

          {status === 'paid' && !ticketUrl && (
            <p className="text-gray-600">
              Thanh toán đã được xác nhận. Vui lòng kiểm tra lịch sử
              đơn hàng để xem vé.
            </p>
          )}

          {status === 'timeout' && (
            <Link to="/orders" className="btn-primary inline-block">
              Xem lịch sử đơn hàng
            </Link>
          )}

          {!orderId && (
            <p className="text-sm text-gray-500">
              Không tìm thấy mã đơn hàng trong đường dẫn.
            </p>
          )}
        </section>
      </main>

      <Footer />
    </div>
  )
}
