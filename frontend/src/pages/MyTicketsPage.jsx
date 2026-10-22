import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'
import { formatDateTime, formatPrice, getErrorMessage } from '../components/event/eventFormat'
import { getMyTickets, getOrderTickets, sendTicketEmail } from '../services/ticketService'

function TicketCard({ ticket }) {
  return (
    <article className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col sm:flex-row">
      <div className="flex-1 p-5 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-pink-600">{ticket.category}</p>
        <h2 className="text-lg font-bold text-gray-900">{ticket.event.title}</h2>
        <p className="text-sm text-gray-600">{ticket.event.venue}</p>
        <p className="text-sm text-gray-700">🕒 {formatDateTime(ticket.showtime.startsAt)}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 pt-2 text-sm">
          <span>Ghế <strong className="text-gray-900">{ticket.seat.label}</strong></span>
          <span>Giá <strong className="text-gray-900">{formatPrice(ticket.price)}</strong></span>
          <span>Mã vé <strong className="font-mono text-gray-900">{ticket.code}</strong></span>
        </div>
        {ticket.status !== 'valid' && (
          <p className="inline-block mt-2 text-xs font-semibold px-2 py-1 rounded bg-red-100 text-red-700">Vé đã bị huỷ</p>
        )}
      </div>
      <div className="sm:w-56 flex flex-col items-center justify-center gap-2 p-4 bg-gray-50 border-t sm:border-t-0 sm:border-l border-dashed border-gray-300">
        <img src={ticket.qrImage} alt={`Mã QR vé ${ticket.code}`} className="w-44 h-44" />
        <p className="text-xs text-gray-500 text-center">Đưa mã này cho nhân viên soát vé tại cổng</p>
      </div>
    </article>
  )
}

/** S-25: "Vé của tôi". ?orderId=... chỉ hiện vé của một đơn (dùng sau khi thanh toán xong). */
export default function MyTicketsPage() {
  const [params] = useSearchParams()
  const orderId = params.get('orderId')
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [emailState, setEmailState] = useState({ sending: false, message: '', ok: false })

  const handleEmail = async () => {
    setEmailState({ sending: true, message: '', ok: false })
    try {
      setEmailState({ sending: false, message: await sendTicketEmail(orderId), ok: true })
    } catch (err) {
      setEmailState({ sending: false, message: getErrorMessage(err, 'Chưa gửi được email. Vui lòng thử lại sau.'), ok: false })
    }
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    ;(orderId ? getOrderTickets(orderId) : getMyTickets())
      .then((list) => { if (active) setTickets(list) })
      .catch((err) => {
        if (!active) return
        if (err?.response?.data?.code === 'ORDER_NOT_PAID') {
          setError('Đơn hàng chưa thanh toán xong. Vé sẽ có ngay khi hệ thống xác nhận thanh toán.')
        } else {
          setError(getErrorMessage(err, 'Không tải được vé. Vui lòng thử lại.'))
        }
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [orderId])

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{orderId ? 'Vé của đơn hàng' : 'Vé của tôi'}</h1>
          {orderId && <Link to="/my-tickets" className="text-sm text-pink-600 hover:underline">Xem tất cả vé</Link>}
        </div>

        {/* S-27: vé đã được gửi email sau khi thanh toán; nút này gửi lại khi cần */}
        {orderId && !loading && !error && tickets.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-3 p-4 rounded-xl bg-indigo-50 text-sm text-indigo-900">
            <span>📧 Vé đã được gửi về email của bạn sau khi thanh toán.</span>
            <button type="button" onClick={handleEmail} disabled={emailState.sending}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-60">
              {emailState.sending ? 'Đang gửi…' : 'Gửi lại vé qua email'}
            </button>
            {emailState.message && (
              <span className={emailState.ok ? 'text-green-700' : 'text-red-700'}>{emailState.message}</span>
            )}
          </div>
        )}

        {loading && <p className="text-gray-500">Đang tải vé…</p>}
        {!loading && error && <p className="p-4 rounded-xl bg-red-50 text-red-700">{error}</p>}
        {!loading && !error && tickets.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-5xl mb-3">🎫</p>
            <p>Bạn chưa có vé nào.</p>
            <Link to="/events" className="btn-primary inline-block mt-4">Tìm sự kiện</Link>
          </div>
        )}
        {!loading && !error && tickets.length > 0 && (
          <div className="space-y-4">
            {tickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}
