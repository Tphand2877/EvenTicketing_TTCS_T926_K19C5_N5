import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'
import SeatHoldTimer from '../components/seatmap/SeatHoldTimer'
import { formatDateTime, formatPrice } from '../components/event/eventFormat'
import { useAuth } from '../context/AuthContext'

const PAYMENT_METHODS = ['Chuyển khoản ngân hàng', 'Ví MoMo', 'Ví ZaloPay', 'Thẻ tín dụng / Ghi nợ']

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
 * Thanh toán (E-05 – giao diện). Nhận hold từ trang chi tiết sự kiện (SCRUM-84).
 * Backend chưa có API đơn hàng/thanh toán, nên bước xác nhận chỉ ghi nhận ở giao diện.
 */
export default function CheckoutPage() {
  const { state } = useLocation()
  const { user } = useAuth()
  const { hold, event, showtime } = state || {}

  const [form, setForm] = useState({
    fullName: user?.fullName || user?.name || '',
    email: user?.email || '',
    phone: '',
    payment: '',
  })
  const [errors, setErrors]       = useState({})
  const [expired, setExpired]     = useState(() => !!hold && new Date(hold.expiresAt) <= new Date())
  const [submitted, setSubmitted] = useState(false)

  const setField = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length === 0) setSubmitted(true)
  }

  const total = showtime ? showtime.price * hold.quantity : 0

  let content
  if (!hold || !event || !showtime) {
    content = (
      <Notice emoji="🎫" title="Bạn chưa giữ chỗ nào">
        <p>Hãy chọn sự kiện, suất diễn và giữ chỗ trước khi thanh toán.</p>
        <Link to="/events" className="btn-primary inline-block max-w-xs">Xem sự kiện</Link>
      </Notice>
    )
  } else if (submitted) {
    content = (
      <Notice emoji="✅" title="Đã ghi nhận yêu cầu đặt vé">
        <p>
          <strong>{hold.quantity} vé</strong> – {event.title}
          <br />
          {formatDateTime(showtime.starts_at)} · {event.venue}
          {hold.seats?.length > 0 && <><br />Ghế: {hold.seats.join(', ')}</>}
        </p>
        <p>Tổng tiền: <strong>{formatPrice(total)}</strong> · {form.payment}</p>
        <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-4 py-3">
          Bản demo: cổng thanh toán và xuất vé (E-05) chưa được tích hợp, chưa có giao dịch nào được thực hiện.
          Chỗ của bạn được giữ đến {formatDateTime(hold.expiresAt)}.
        </p>
        <Link to="/events" className="btn-primary inline-block max-w-xs">Về trang sự kiện</Link>
      </Notice>
    )
  } else if (expired) {
    content = (
      <Notice emoji="⏰" title="Hết thời gian giữ chỗ">
        <p>Chỗ của bạn đã được trả lại. Vui lòng chọn và giữ chỗ lại.</p>
        <Link to={`/events/${event.id}`} className="btn-primary inline-block max-w-xs">Quay lại sự kiện</Link>
      </Notice>
    )
  } else {
    content = (
      <>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Thanh toán</h1>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="md:col-span-3 card-auth space-y-4">
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
                  <span className="text-sm text-gray-700">{m}</span>
                </label>
              ))}
              {errors.payment && <p className="text-xs text-red-600">{errors.payment}</p>}
            </div>

            <button type="submit" className="btn-primary mt-2">Xác nhận đặt vé</button>
          </form>

          {/* Summary */}
          <div className="md:col-span-2">
            <div className="card-auth sticky top-20 space-y-4">
              <SeatHoldTimer expiresAt={hold.expiresAt} onExpire={() => setExpired(true)} />
              <h2 className="font-semibold text-gray-900">Tóm tắt đơn hàng</h2>
              <div className="space-y-3 text-sm text-gray-600">
                <div>
                  <div className="font-medium text-gray-900">{event.title}</div>
                  <div className="text-xs">{formatDateTime(showtime.starts_at)} · {event.venue}</div>
                </div>
                {hold.seats?.length > 0 && (
                  <div className="flex justify-between gap-4">
                    <span>Ghế</span>
                    <span className="text-right">{hold.seats.join(', ')}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Giá vé</span>
                  <span>{formatPrice(showtime.price)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Số lượng</span>
                  <span>× {hold.quantity}</span>
                </div>
                <div className="border-t border-gray-100 pt-3 flex justify-between font-bold text-gray-900">
                  <span>Tổng cộng</span>
                  <span className="text-gradient">{formatPrice(total)}</span>
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
