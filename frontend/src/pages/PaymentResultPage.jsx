import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'
import { getPaymentStatus } from '../services/paymentStatusService'
import { getOrderDetail } from '../services/orderService'
import { getOrderTickets } from '../services/ticketService'
import { formatDateTime, formatPrice } from '../components/event/eventFormat'

const POLL_INTERVAL = 2000
const MAX_WAIT = 60000
const FINAL = new Set(['paid', 'failed', 'expired', 'cancelled', 'needs_review'])

const VIEW = {
  checking: {
    title: 'Đang xác nhận thanh toán',
    message: 'Vui lòng chờ trong khi hệ thống nhận kết quả từ cổng thanh toán.',
  },
  paid: {
    title: 'Thanh toán thành công!',
    message: 'Máy chủ đã xác nhận giao dịch. Hóa đơn và vé điện tử của bạn đã sẵn sàng.',
  },
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

export default function PaymentResultPage() {
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('orderId')
  const [status, setStatus] = useState(orderId ? 'checking' : 'missing')
  const [orderDetail, setOrderDetail] = useState(null)
  const [tickets, setTickets] = useState([])
  const [loadingDetails, setLoadingDetails] = useState(false)

  // 1. Kiểm tra trạng thái thanh toán từ server
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

  // 2. Khi status chuyển sang 'paid', tải hóa đơn chi tiết và vé điện tử kèm mã QR
  useEffect(() => {
    if (status !== 'paid' || !orderId) return
    let active = true
    setLoadingDetails(true)

    Promise.all([
      getOrderDetail(orderId).catch(() => null),
      getOrderTickets(orderId).catch(() => []),
    ]).then(([orderRes, ticketList]) => {
      if (!active) return
      if (orderRes?.data) setOrderDetail(orderRes.data)
      if (Array.isArray(ticketList)) setTickets(ticketList)
    }).finally(() => {
      if (active) setLoadingDetails(false)
    })

    return () => { active = false }
  }, [status, orderId])

  const handlePrint = () => {
    window.print()
  }

  const view = VIEW[status]

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="print:hidden">
        <Header />
      </div>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        {/* Banner trạng thái */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center space-y-4 mb-6 print:hidden">
          <div className="text-5xl mb-2">
            {status === 'paid' ? '🎉' : status === 'checking' ? '⏳' : '⚠️'}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{view.title}</h1>
          <p className="text-gray-600 max-w-lg mx-auto">{view.message}</p>

          {status === 'checking' && (
            <div className="inline-flex items-center gap-2 text-pink-600 font-medium py-2">
              <span className="w-4 h-4 border-2 border-pink-600 border-t-transparent rounded-full animate-spin" />
              Đang xác nhận kết quả từ cổng thanh toán…
            </div>
          )}

          {status === 'paid' && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handlePrint}
                className="btn-primary inline-flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
              >
                <span>🖨️</span>
                <span>In Hóa đơn & Vé</span>
              </button>
              <Link to="/my-tickets" className="btn-secondary inline-flex items-center gap-2">
                <span>🎫</span>
                <span>Xem tất cả vé của tôi</span>
              </Link>
              <Link to="/orders" className="btn-secondary inline-flex items-center gap-2">
                <span>📋</span>
                <span>Lịch sử đơn hàng</span>
              </Link>
            </div>
          )}

          {status !== 'checking' && status !== 'paid' && (
            <Link to="/events" className="btn-primary inline-block">
              {['expired', 'cancelled'].includes(status) ? 'Chọn ghế lại' : 'Về trang sự kiện'}
            </Link>
          )}
        </section>

        {/* NỘI DUNG HÓA ĐƠN VÀ VÉ KHI THANH TOÁN THÀNH CÔNG */}
        {status === 'paid' && (
          <div className="space-y-6 print:space-y-4">
            {loadingDetails && (
              <p className="text-center text-gray-500 py-6">Đang chuẩn bị hóa đơn và vé điện tử…</p>
            )}

            {/* 1. HÓA ĐƠN BÁN VÉ ĐIỆN TỬ (INVOICE DEMO) */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 relative overflow-hidden print:shadow-none print:border-gray-400 print:p-4">
              {/* Con dấu ĐÃ THANH TOÁN */}
              <div className="absolute right-6 top-6 sm:right-10 sm:top-10 rotate-12 pointer-events-none select-none">
                <div className="border-4 border-emerald-600 text-emerald-600 px-4 py-1.5 rounded-xl font-black text-sm sm:text-base uppercase tracking-widest bg-emerald-50/80 shadow-sm opacity-90">
                  ✓ ĐÃ THANH TOÁN
                </div>
              </div>

              {/* Tiêu đề Hóa đơn */}
              <div className="border-b border-gray-200 pb-5 mb-6">
                <div className="flex items-center gap-2 text-pink-600 font-bold text-xl mb-1">
                  <span>🎟️ EvenTicketing</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-gray-900 uppercase tracking-tight">
                  HÓA ĐƠN BÁN VÉ ĐIỆN TỬ
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Mã hóa đơn: <strong className="font-mono text-gray-700">#HD-{orderId?.slice(0, 8).toUpperCase()}</strong> &bull; Ngày lập: {formatDateTime(orderDetail?.created_at || new Date().toISOString())}
                </p>
              </div>

              {/* Thông tin đơn hàng & Người mua */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm text-gray-600 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100 print:bg-transparent">
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Thông tin khách hàng:</p>
                  <p>Họ tên: <strong className="text-gray-900">{orderDetail?.user_name || orderDetail?.customer_name || 'Khách hàng EvenTicketing'}</strong></p>
                  <p>Mã đơn hàng: <span className="font-mono text-xs">{orderId}</span></p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Phương thức thanh toán:</p>
                  <p>Cổng: <strong className="text-gray-900 uppercase">{orderDetail?.gateway_provider || 'Ví điện tử / Cổng thanh toán'}</strong></p>
                  {orderDetail?.gateway_transaction_id && (
                    <p>Mã giao dịch: <span className="font-mono text-xs text-gray-700">{orderDetail.gateway_transaction_id}</span></p>
                  )}
                  <p>Trạng thái: <strong className="text-emerald-600">Thành công (100%)</strong></p>
                </div>
              </div>

              {/* Bảng kê chi tiết các vé đã mua */}
              <div className="overflow-x-auto mb-6">
                <table className="w-full text-left text-xs sm:text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500 bg-gray-50 print:bg-transparent">
                      <th className="py-2.5 px-3 font-semibold">STT</th>
                      <th className="py-2.5 px-3 font-semibold">Sự kiện & Suất diễn</th>
                      <th className="py-2.5 px-3 font-semibold">Hạng vé / Ghế</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Đơn giá</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orderDetail?.items?.length > 0 ? (
                      orderDetail.items.map((item, index) => (
                        <tr key={item.id || index} className="hover:bg-gray-50/50">
                          <td className="py-3 px-3 text-gray-500">{index + 1}</td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-gray-900">{orderDetail.event_title || item.event_title || 'Sự kiện EvenTicketing'}</div>
                            <div className="text-xs text-gray-500">{orderDetail.venue || item.venue} &bull; {formatDateTime(orderDetail.showtime_starts_at || item.starts_at)}</div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-semibold text-gray-900">Ghế {item.row_label || item.seat_row}{item.seat_number}</span>
                            <span className="ml-1.5 px-2 py-0.5 rounded text-[11px] bg-pink-50 text-pink-700 font-medium border border-pink-100">
                              {item.category_name || item.category || 'Vé tiêu chuẩn'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-gray-900">
                            {formatPrice(item.unit_price)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-3 px-3 text-center text-gray-500">
                          {orderDetail?.total_amount ? `Tổng thanh toán: ${formatPrice(orderDetail.total_amount)}` : 'Đang tải chi tiết các mục…'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300">
                      <td colSpan={3} className="py-3 px-3 text-right font-bold text-gray-900">
                        Tổng tiền đã thanh toán:
                      </td>
                      <td className="py-3 px-3 text-right font-black text-pink-600 text-base sm:text-lg">
                        {formatPrice(orderDetail?.total_amount || 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="text-center text-xs text-gray-400 border-t border-gray-100 pt-3">
                Cảm ơn quý khách đã mua vé tại EvenTicketing. Vui lòng xuất trình mã QR vé điện tử bên dưới tại cổng soát vé.
              </div>
            </div>

            {/* 2. DANH SÁCH VÉ ĐIỆN TỬ VỚI ẢNH MÃ QR (DEMO TICKET) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <span>🎟️</span>
                  <span>Vé điện tử kèm Mã QR ({tickets.length} vé)</span>
                </h3>
                <span className="text-xs text-gray-500 print:hidden">Xuất trình QR khi qua cổng</span>
              </div>

              {tickets.map((ticket, idx) => (
                <article
                  key={ticket.id || idx}
                  className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col sm:flex-row print:break-inside-avoid print:border-gray-400"
                >
                  {/* Phần thông tin vé */}
                  <div className="flex-1 p-6 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-pink-600 bg-pink-50 px-2.5 py-1 rounded-md border border-pink-100">
                        Hạng {ticket.category || 'Tiêu chuẩn'}
                      </span>
                      <span className="text-xs font-mono text-gray-500">
                        Mã vé: <strong className="text-gray-900">{ticket.code}</strong>
                      </span>
                    </div>

                    <h4 className="text-xl font-black text-gray-900 leading-snug">
                      {ticket.event?.title || orderDetail?.event_title || 'Sự kiện'}
                    </h4>

                    <div className="text-xs sm:text-sm text-gray-600 space-y-1">
                      <p className="flex items-center gap-1.5">
                        <span>📍</span>
                        <span>{ticket.event?.venue || orderDetail?.venue || 'Địa điểm tổ chức'}</span>
                      </p>
                      <p className="flex items-center gap-1.5 font-medium text-gray-800">
                        <span>🕒</span>
                        <span>{formatDateTime(ticket.showtime?.startsAt || orderDetail?.showtime_starts_at)}</span>
                      </p>
                    </div>

                    <div className="pt-3 border-t border-gray-100 flex flex-wrap gap-4 text-xs sm:text-sm">
                      <div className="bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                        <span className="text-gray-500">Vị trí: </span>
                        <strong className="text-gray-900 text-base">Ghế {ticket.seat?.label}</strong>
                      </div>
                      <div className="bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                        <span className="text-gray-500">Giá vé: </span>
                        <strong className="text-pink-600">{formatPrice(ticket.price)}</strong>
                      </div>
                      <div className="bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-800 font-semibold">
                        ✓ Vé hợp lệ
                      </div>
                    </div>
                  </div>

                  {/* Phần ảnh Mã QR có đường đứt nét tách vé */}
                  <div className="sm:w-60 flex flex-col items-center justify-center p-5 bg-gradient-to-b from-gray-50 to-pink-50/30 border-t sm:border-t-0 sm:border-l-2 border-dashed border-gray-300 text-center">
                    {ticket.qrImage ? (
                      <img
                        src={ticket.qrImage}
                        alt={`Mã QR vé ${ticket.code}`}
                        className="w-44 h-44 bg-white p-2 rounded-xl shadow-xs border border-gray-200 print:w-40 print:h-40"
                      />
                    ) : (
                      <div className="w-40 h-40 bg-gray-100 rounded-xl flex items-center justify-center text-xs text-gray-400">
                        Mã QR
                      </div>
                    )}
                    <p className="text-[11px] font-mono text-gray-600 mt-2">
                      MÃ QR CHECK-IN TẠI CỔNG
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </main>

      <div className="print:hidden">
        <Footer />
      </div>
    </div>
  )
}
