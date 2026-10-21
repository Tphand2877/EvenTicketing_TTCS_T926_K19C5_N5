import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'
import { getPaymentStatus } from '../services/paymentStatusService'
import { getOrderTickets, resendTicketEmail } from '../services/ticketService'
import { formatDateTime, formatPrice } from '../components/event/eventFormat'

const POLL_INTERVAL = 2000
const MAX_WAIT = 60000
const FINAL = new Set(['paid', 'failed', 'expired', 'cancelled', 'needs_review'])

const VIEW = {
  checking: {
    title: 'Đang xác nhận thanh toán',
    message: 'Vui lòng chờ trong khi hệ thống xác thực kết quả thanh toán từ máy chủ...',
  },
  paid: {
    title: 'Thanh toán thành công 🎉',
    message: 'Máy chủ đã xác nhận giao dịch. Vé điện tử kèm mã QR đã được phát hành và gửi về email của bạn!',
  },
  failed: {
    title: 'Thanh toán chưa thành công',
    message: 'Cổng thanh toán báo giao dịch thất bại. Đơn hàng vẫn chờ thanh toán, ghế vẫn được giữ đến khi hết thời hạn.',
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
    message: 'Hệ thống cần kiểm tra thêm giao dịch này. Bộ phận hỗ trợ sẽ liên hệ với bạn.',
  },
  timeout: {
    title: 'Chưa nhận được kết quả',
    message: 'Chưa có xác nhận từ máy chủ. Vui lòng không thanh toán lại ngay. Tải lại trang sau ít phút để kiểm tra.',
  },
  missing: {
    title: 'Không tìm thấy đơn hàng',
    message: 'Đường dẫn không có mã đơn hàng.',
  },
}

export default function PaymentResultPage() {
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('orderId')
  const [status, setStatus] = useState(orderId ? 'checking' : 'missing')
  const [ticketsData, setTicketsData] = useState(null)
  const [loadingTickets, setLoadingTickets] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendMsg, setResendMsg] = useState(null)

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
        if ([403, 404].includes(error?.response?.status)) {
          setStatus('missing')
          return
        }
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

  // Khi đơn hàng paid -> tải danh sách vé kèm mã QR
  useEffect(() => {
    if (status !== 'paid' || !orderId) return
    let active = true
    const fetchTickets = async () => {
      setLoadingTickets(true)
      try {
        const data = await getOrderTickets(orderId)
        if (active) setTicketsData(data)
      } catch {
        // Có thể vé đang được phát hành, bỏ qua lỗi
      } finally {
        if (active) setLoadingTickets(false)
      }
    }
    fetchTickets()
    return () => { active = false }
  }, [status, orderId])

  const handleResendEmail = async () => {
    if (!orderId || resending) return
    setResending(true)
    setResendMsg(null)
    try {
      const res = await resendTicketEmail(orderId)
      setResendMsg({ type: 'success', text: res.message || 'Đã gửi lại vé qua email thành công!' })
    } catch (err) {
      const msg = err.response?.data?.message || 'Gửi lại email thất bại. Vui lòng thử lại sau.'
      setResendMsg({ type: 'error', text: msg })
    } finally {
      setResending(false)
    }
  }

  const view = VIEW[status]
  const tickets = ticketsData?.tickets || []
  const firstTicket = tickets[0]

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-10">
        <section className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">{view.title}</h1>
            <p className="text-gray-600 text-sm sm:text-base max-w-xl mx-auto">{view.message}</p>
          </div>

          {status === 'checking' && (
            <div className="py-8 flex flex-col items-center justify-center space-y-3">
              <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              <div className="animate-pulse text-indigo-600 text-sm font-medium">
                Đang đối soát trạng thái đơn hàng #{orderId?.slice(0, 8)}...
              </div>
            </div>
          )}

          {status === 'paid' && (
            <div className="space-y-6 text-left">
              {/* Thông báo email đã gửi (S-27) */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">📧</span>
                  <div>
                    <div className="text-sm font-semibold text-emerald-900">
                      Vé điện tử và mã QR đã được gửi về email của bạn!
                    </div>
                    <div className="text-xs text-emerald-700">
                      Vui lòng kiểm tra hộp thư đến (và thư mục Spam) để lưu mã vé.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleResendEmail}
                  disabled={resending}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-all shadow-sm shrink-0 disabled:opacity-50"
                >
                  {resending ? 'Đang gửi...' : 'Gửi lại email vé'}
                </button>
              </div>

              {resendMsg && (
                <div className={`text-xs p-3 rounded-xl ${resendMsg.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {resendMsg.text}
                </div>
              )}

              {/* Chi tiết sự kiện */}
              {firstTicket && (
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-5 border border-indigo-100">
                  <div className="text-lg font-bold text-indigo-950">{firstTicket.eventTitle}</div>
                  <div className="text-sm text-gray-600 mt-1">📍 {firstTicket.eventVenue}</div>
                  <div className="text-sm text-gray-600">🕒 {formatDateTime(firstTicket.startsAt)}</div>
                </div>
              )}

              {/* Danh sách vé và QR codes */}
              <div className="space-y-3">
                <h2 className="text-base font-bold text-gray-900">
                  Vé của bạn ({tickets.length} vé)
                </h2>

                {loadingTickets && (
                  <div className="text-center py-6 text-gray-400 text-sm">
                    Đang nạp mã QR vé...
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {tickets.map((t) => (
                    <div
                      key={t.ticketId}
                      className="bg-white border-2 border-indigo-100 rounded-2xl p-4 shadow-sm flex flex-col items-center text-center relative overflow-hidden"
                    >
                      <div className="w-full flex justify-between items-center text-xs pb-2 mb-2 border-b border-gray-100">
                        <span className="font-bold text-indigo-600">Ghế {t.seatLabel}</span>
                        <span className="text-gray-500 font-medium">{t.categoryName}</span>
                        <span className="font-bold text-gray-900">{formatPrice(t.unitPrice)}</span>
                      </div>

                      {t.qrCodeDataUrl ? (
                        <img
                          src={t.qrCodeDataUrl}
                          alt={`QR ${t.ticketId}`}
                          className="w-40 h-40 object-contain rounded-lg border border-gray-100 p-1 bg-white shadow-sm"
                        />
                      ) : (
                        <div className="w-40 h-40 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xs">
                          Mã QR bảo mật
                        </div>
                      )}

                      <div className="mt-3 text-[11px] font-mono text-gray-500 tracking-wider">
                        {t.ticketId}
                      </div>
                      <div className="mt-1 text-[10px] text-emerald-600 font-medium">
                        ✓ Chữ ký số hợp lệ · Sẵn sàng soát vé
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {status !== 'checking' && (
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/events" className="btn-primary w-full sm:w-auto px-8">
                {['expired', 'cancelled'].includes(status) ? 'Chọn ghế lại' : 'Khám phá sự kiện khác'}
              </Link>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  )
}
