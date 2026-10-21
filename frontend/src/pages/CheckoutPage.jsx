import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'
import SeatHoldTimer from '../components/seatmap/SeatHoldTimer'
import { getServerNow } from '../services/apiClient'
import { formatDateTime, formatPrice } from '../components/event/eventFormat'
import { useAuth } from '../context/AuthContext'
import { createOrder, getOrderSummary, initiatePayment } from '../services/orderService'

const PAYMENT_METHODS = ['Ví MoMo', 'Cổng thanh toán giả lập (Mock)', 'Chuyển khoản ngân hàng', 'Thẻ tín dụng / Ghi nợ']

const validate = ({ fullName, email, phone, payment }) => {
  const errors = {}
  if (!fullName.trim()) errors.fullName = 'Vui lòng nhập họ và tên.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Email không đúng định dạng.'
  if (!/^(0|\+84)\d{9}$/.test(phone.replace(/[\s.-]/g, ''))) errors.phone = 'Số điện thoại không hợp lệ (VD: 0912 345 678).'
  if (!payment) errors.payment = 'Vui lòng chọn phương thức thanh toán.'
  return errors
}

function Notice({ emoji, title, children }) {
  return (
    <div className="max-w-md mx-auto text-center py-16">
      <div className="text-6xl mb-4">{emoji}</div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>
      <div className="text-gray-600 space-y-4">{children}</div>
    </div>
  )
}

/**
 * T-39 / S-17: Xem lại chi tiết đơn trước khi thanh toán
 * - AC1: Hiển thị tên sự kiện, suất, từng ghế kèm hạng và đơn giá, tổng tiền và thời gian còn lại
 * - AC2: Server tự tính tổng tiền từ giá hạng ghế máy chủ (client-supplied total bị bỏ qua)
 * - AC3: Hết hạn thanh toán -> hiển thị đơn đã hết hạn và ẩn nút thanh toán
 * - NFR: Chỉ chủ đơn xem được đơn hàng
 */
export default function CheckoutPage() {
  const { state } = useLocation()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const { hold: initialHold, event: initialEvent, showtime: initialShowtime, orderId: initialOrderId } = state || {}

  const orderIdParam = searchParams.get('orderId') || initialOrderId

  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const [form, setForm] = useState({
    fullName: user?.fullName || user?.name || '',
    email: user?.email || '',
    phone: '',
    payment: 'Ví MoMo',
  })
  const [errors, setErrors] = useState({})
  const [expired, setExpired] = useState(false)
  const [paying, setPaying] = useState(false)
  const [paymentError, setPaymentError] = useState('')

  // 1. Tải đơn từ server nếu có orderId (đảm bảo AC1, AC2, AC3 và NFR xác thực qua máy chủ)
  useEffect(() => {
    let isMounted = true

    const loadExistingOrder = async (id) => {
      setLoading(true)
      setErrorMsg('')
      try {
        const orderData = await getOrderSummary(id)
        if (!isMounted) return
        setOrder(orderData)
        if (orderData.is_expired || orderData.status === 'expired') {
          setExpired(true)
        }
      } catch (err) {
        if (!isMounted) return
        if (err.response?.status === 403) {
          setErrorMsg('Bạn không có quyền xem đơn hàng này.')
        } else if (err.response?.status === 404) {
          setErrorMsg('Không tìm thấy đơn hàng.')
        } else {
          setErrorMsg(err.response?.data?.message || 'Không thể tải thông tin đơn hàng.')
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    const createOrderFromIncomingHold = async (h) => {
      setLoading(true)
      setErrorMsg('')
      try {
        // T-38: Tạo đơn tại máy chủ; bỏ qua bất kỳ số tiền nào tính ở client
        const newOrder = await createOrder(h.id)
        if (!isMounted) return
        setOrder(newOrder)
        if (newOrder.is_expired || newOrder.status === 'expired') {
          setExpired(true)
        }
      } catch (err) {
        if (!isMounted) return
        if (err.response?.status === 409) {
          setExpired(true)
        } else {
          setErrorMsg(err.response?.data?.message || 'Không thể tạo đơn hàng từ lượt giữ chỗ.')
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    if (orderIdParam) {
      loadExistingOrder(orderIdParam)
    } else if (initialHold?.id) {
      createOrderFromIncomingHold(initialHold)
    }

    return () => {
      isMounted = false
    }
  }, [orderIdParam, initialHold])

  // Kiểm tra thời hạn ban đầu
  useEffect(() => {
    if (order?.expires_at) {
      const isExp = new Date(order.expires_at).getTime() <= getServerNow()
      if (isExp) setExpired(true)
    } else if (initialHold?.expiresAt) {
      const isExp = new Date(initialHold.expiresAt).getTime() <= getServerNow()
      if (isExp) setExpired(true)
    }
  }, [order, initialHold])

  const setField = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const handlePay = async (e) => {
    e.preventDefault()
    if (expired || order?.is_expired) return

    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    if (!order?.id) {
      setPaymentError('Chưa có mã đơn hàng hợp lệ.')
      return
    }

    setPaying(true)
    setPaymentError('')
    try {
      if (form.payment === 'Cổng thanh toán giả lập (Mock)') {
        window.location.href = `/mock-gateway?orderId=${encodeURIComponent(order.id)}&amount=${order.total_amount}&returnUrl=${encodeURIComponent(`/checkout?orderId=${order.id}`)}`
        return
      }

      // Thanh toán qua MoMo Sandbox (S-18)
      const payment = await initiatePayment(order.id)
      if (payment.redirectUrl) {
        window.location.href = payment.redirectUrl
      } else {
        setPaymentError('Không nhận được đường dẫn thanh toán từ cổng.')
      }
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.code === 'ORDER_EXPIRED') {
        setExpired(true)
      } else {
        setPaymentError(err.response?.data?.message || 'Không thể khởi tạo thanh toán.')
      }
    } finally {
      setPaying(false)
    }
  }

  // Dữ liệu hiển thị ưu tiên từ server order (AC1, AC2)
  const event = order?.event || initialEvent
  const showtime = order?.showtime || initialShowtime
  const expiresAt = order?.expires_at || initialHold?.expiresAt
  const totalAmount = order ? order.total_amount : (showtime && initialHold ? showtime.price * initialHold.quantity : 0)
  const items = order?.items || []

  let content
  if (loading) {
    content = (
      <div className="py-20 text-center space-y-3">
        <div className="inline-block w-8 h-8 border-3 border-pink-200 border-t-pink-600 rounded-full animate-spin" />
        <p className="text-gray-600 text-sm">Đang tải chi tiết đơn hàng...</p>
      </div>
    )
  } else if (errorMsg) {
    content = (
      <Notice emoji="⚠️" title="Không thể xem đơn hàng">
        <p className="text-red-600">{errorMsg}</p>
        <Link to="/events" className="btn-primary inline-block max-w-xs">Xem sự kiện khác</Link>
      </Notice>
    )
  } else if (!order && (!initialHold || !initialEvent || !initialShowtime)) {
    content = (
      <Notice emoji="🎫" title="Bạn chưa giữ chỗ nào">
        <p>Hãy chọn sự kiện, suất diễn và giữ chỗ trước khi thanh toán.</p>
        <Link to="/events" className="btn-primary inline-block max-w-xs">Xem sự kiện</Link>
      </Notice>
    )
  } else if (expired || order?.is_expired || order?.status === 'expired') {
    // AC3: Thời hạn thanh toán đã hết -> thông báo đơn đã hết hạn và nút thanh toán bị ẩn
    content = (
      <Notice emoji="⏰" title="Đơn hàng đã hết hạn thanh toán">
        <p>Thời gian giữ ghế và thanh toán cho đơn hàng này đã kết thúc. Các ghế đã được hoàn lại về kho vé.</p>
        {event?.id ? (
          <Link to={`/events/${event.id}`} className="btn-primary inline-block max-w-xs mt-4">
            Quay lại chọn vé
          </Link>
        ) : (
          <Link to="/events" className="btn-primary inline-block max-w-xs mt-4">
            Xem danh sách sự kiện
          </Link>
        )}
      </Notice>
    )
  } else {
    content = (
      <>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Xem lại đơn hàng trước khi thanh toán</h1>
            {order?.id && (
              <p className="text-xs text-gray-500 mt-1">Mã đơn: <span className="font-mono">{order.id}</span></p>
            )}
          </div>
          {expiresAt && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 flex items-center gap-2 text-sm text-amber-900">
              <span className="text-base" aria-hidden="true">⏱️</span>
              <SeatHoldTimer expiresAt={expiresAt} onExpire={() => setExpired(true)} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {/* Form thông tin thanh toán */}
          <form onSubmit={handlePay} noValidate className="md:col-span-3 card-auth space-y-4">
            <h2 className="font-semibold text-gray-900">Thông tin người mua</h2>
            {[
              { name: 'fullName', label: 'Họ và tên', type: 'text', placeholder: 'Nguyễn Văn A' },
              { name: 'email', label: 'Email nhận vé', type: 'email', placeholder: 'ban@example.com' },
              { name: 'phone', label: 'Số điện thoại', type: 'tel', placeholder: '0912 345 678' },
            ].map(({ name, label, type, placeholder }) => (
              <div key={name}>
                <label htmlFor={`checkout-${name}`} className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
                <input
                  id={`checkout-${name}`}
                  name={name}
                  type={type}
                  value={form[name]}
                  onChange={setField}
                  placeholder={placeholder}
                  className={`input-field ${errors[name] ? 'input-field-error' : ''}`}
                />
                {errors[name] && <p className="text-xs text-red-600 mt-1">{errors[name]}</p>}
              </div>
            ))}

            <h2 className="font-semibold text-gray-900 pt-2">Phương thức thanh toán</h2>
            <div className="space-y-2">
              {PAYMENT_METHODS.map((m) => (
                <label
                  key={m}
                  className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-all ${
                    form.payment === m ? 'border-pink-500 bg-pink-50/50' : 'border-gray-200 hover:border-pink-400 hover:bg-pink-50/50'
                  }`}
                >
                  <input type="radio" name="payment" value={m} checked={form.payment === m} onChange={setField} className="text-pink-600" />
                  <span className="text-sm text-gray-700 font-medium">{m}</span>
                </label>
              ))}
              {errors.payment && <p className="text-xs text-red-600">{errors.payment}</p>}
            </div>

            {paymentError && (
              <div role="alert" className="p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200">
                {paymentError}
              </div>
            )}

            {/* AC3: Nếu đã hết hạn thì nút thanh toán bị ẩn hoàn toàn */}
            {!expired && (
              <button
                type="submit"
                disabled={paying}
                className="btn-primary mt-2 w-full flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {paying ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Đang chuyển tới cổng thanh toán…
                  </>
                ) : (
                  `Thanh toán ${formatPrice(totalAmount)}`
                )}
              </button>
            )}
          </form>

          {/* AC1: Bảng tóm tắt đơn: sự kiện, suất, từng ghế kèm hạng và đơn giá, tổng tiền */}
          <div className="md:col-span-2">
            <div className="card-auth sticky top-20 space-y-4">
              <h2 className="font-semibold text-gray-900">Chi tiết vé & Ghế ngồi</h2>
              <div className="space-y-3 text-sm text-gray-600">
                {event && (
                  <div className="border-b border-gray-100 pb-3">
                    <div className="font-semibold text-gray-900 text-base">{event.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {showtime?.starts_at && formatDateTime(showtime.starts_at)} {event.venue && `· ${event.venue}`}
                    </div>
                  </div>
                )}

                {/* Danh sách từng ghế kèm hạng và đơn giá */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Danh sách ghế</div>
                  {items.length > 0 ? (
                    <div className="space-y-2 divide-y divide-gray-50 max-h-56 overflow-y-auto pr-1">
                      {items.map((item) => (
                        <div key={item.id || item.seat_id} className="pt-2 flex justify-between items-center text-xs">
                          <div>
                            <span className="font-bold text-gray-900 text-sm">
                              {item.row ? `Ghế ${item.row}${item.number}` : `Ghế #${item.seat_id}`}
                            </span>
                            <span className="ml-2 inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-pink-50 text-pink-700">
                              {item.category_name || 'Standard'}
                            </span>
                          </div>
                          <span className="font-semibold text-gray-800">{formatPrice(item.unit_price)}</span>
                        </div>
                      ))}
                    </div>
                  ) : initialHold?.seats?.length > 0 ? (
                    <div className="flex justify-between items-center text-xs">
                      <span>Ghế: {initialHold.seats.join(', ')}</span>
                      <span>{formatPrice(showtime?.price || 0)}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-xs">
                      <span>Số lượng vé: {initialHold?.quantity || 1}</span>
                      <span>{formatPrice(showtime?.price || 0)}</span>
                    </div>
                  )}
                </div>

                {/* Tổng tiền tính lại từ máy chủ (AC2) */}
                <div className="border-t border-gray-100 pt-3 flex justify-between font-bold text-gray-900 text-base">
                  <span>Tổng tiền</span>
                  <span className="text-gradient">{formatPrice(totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">{content}</main>
      <Footer />
    </div>
  )
}
