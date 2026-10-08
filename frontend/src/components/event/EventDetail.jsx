import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getAvailability, holdSeats, releaseHold, releaseSeat } from '../../services/eventService'
import SeatHoldTimer from '../seatmap/SeatHoldTimer'
import SeatLegend from '../seatmap/SeatLegend'
import SeatMapCanvas from '../seatmap/SeatMapCanvas'
import { seatName } from '../seatmap/seatUtils'
import ShowtimeList from './ShowtimeList'
import { formatDateTime, formatPrice, getCategoryStyle, getErrorMessage } from './eventFormat'

const MAX_TICKETS = 10
// Suất diễn lớn hơn ngưỡng này dùng dropdown số lượng thay vì vẽ sơ đồ ghế
const SEAT_MAP_MAX_CAPACITY = 300

/**
 * Chi tiết sự kiện + khung đặt vé (SCRUM-80) với giữ chỗ có thời hạn (SCRUM-84)
 */
export default function EventDetail({ event, showtimes }) {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { color, emoji } = getCategoryStyle(event.category)

  const [selectedId, setSelectedId]     = useState(null)
  const [quantity, setQuantity]         = useState(1)
  const [seats, setSeats]               = useState([])
  const [availability, setAvailability] = useState(null)
  const [hold, setHold]                 = useState(null)
  const [busy, setBusy]                 = useState(false)
  const [message, setMessage]           = useState(null)

  const selectedShowtime = showtimes.find((s) => s.id === selectedId)

  const refreshAvailability = useCallback(async (showtimeId) => {
    try {
      setAvailability(await getAvailability(showtimeId))
    } catch {
      setAvailability(null)
    }
  }, [])

  useEffect(() => {
    if (selectedId) refreshAvailability(selectedId)
  }, [selectedId, refreshAvailability])

  const handleSelect = (id) => {
    setSelectedId(id)
    setSeats([])
    setMessage(null)
  }

  const handleHold = async () => {
    if (!isAuthenticated) {
      navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`)
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const newHold = await holdSeats(selectedId, ticketCount)
      // SCRUM-175: lưu thêm mã ghế (seatIds) để bỏ chọn từng ghế
      setHold({
        ...newHold,
        seats: useSeatMap ? seats.map(seatName) : [],
        seatIds: useSeatMap ? seats : [],
      })
      setSeats([])
    } catch (err) {
      setMessage({ type: 'error', text: getErrorMessage(err, 'Không thể giữ chỗ, vui lòng thử lại.') })
    } finally {
      setBusy(false)
      refreshAvailability(selectedId)
    }
  }

  const handleRelease = async () => {
    setBusy(true)
    try {
      await releaseHold(hold.id)
    } catch {
      // Hold có thể đã hết hạn ở server – vẫn xóa ở client
    } finally {
      setHold(null)
      setBusy(false)
      refreshAvailability(selectedId)
    }
  }

  // SCRUM-175 (T-26): bỏ chọn MỘT ghế đang giữ. Chỉ một request mạng, nên cập nhật
  // số chỗ còn lại tại chỗ thay vì gọi lại getAvailability.
  // TODO: đối chiếu route và response với T-25 của Thái.
  const handleReleaseSeat = async (seatId) => {
    setBusy(true)
    setMessage(null)
    try {
      const updated = await releaseSeat(hold.id, seatId)
      const seatIds = heldSeatIds.filter((s) => s !== seatId)
      if (!updated || seatIds.length === 0) {
        setHold(null) // hết ghế -> ẩn đồng hồ
      } else {
        setHold({ ...hold, ...updated, seatIds, seats: seatIds.map(seatName) })
      }
      setAvailability((prev) => (prev ? { ...prev, available: prev.available + 1 } : prev))
    } catch (err) {
      setMessage({ type: 'error', text: getErrorMessage(err, 'Không thể bỏ chọn ghế, vui lòng thử lại.') })
    } finally {
      setBusy(false)
    }
  }

  const handleExpire = useCallback(() => {
    setHold(null)
    setMessage({ type: 'error', text: 'Hết thời gian giữ chỗ. Vui lòng chọn lại.' })
    if (selectedId) refreshAvailability(selectedId)
  }, [selectedId, refreshAvailability])

  const maxQuantity = Math.max(Math.min(MAX_TICKETS, availability?.available ?? MAX_TICKETS), 1)
  const soldOut = availability?.available === 0
  const useSeatMap = !!availability && availability.capacity <= SEAT_MAP_MAX_CAPACITY
  const ticketCount = useSeatMap ? seats.length : Math.min(quantity, maxQuantity)
  // SCRUM-175: danh sách ghế đang giữ và số vé đang giữ
  const heldSeatIds = hold?.seatIds ?? []
  const heldCount = heldSeatIds.length > 0 ? heldSeatIds.length : (hold?.quantity ?? 0)

  return (
    <>
      {/* Hero */}
      <div className={`h-72 bg-gradient-to-br ${color} flex items-center justify-center text-white relative overflow-hidden`}>
        {event.image_url
          ? <img src={event.image_url} alt={event.title} className="absolute inset-0 w-full h-full object-cover" />
          : <span className="text-8xl">{emoji}</span>}
        <div className="absolute inset-0 bg-black/20" />
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main info */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <span className="inline-block text-xs font-semibold text-pink-600 bg-pink-50 px-3 py-1 rounded-full mb-3">
                {event.category}
              </span>
              <h1 className="text-3xl font-bold text-gray-900">{event.title}</h1>
              {event.organizer_name && (
                <p className="text-sm text-gray-500 mt-1">Ban tổ chức: {event.organizer_name}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {formatDateTime(event.next_starts_at)}
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {event.venue}
              </div>
            </div>

            {event.description && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Giới thiệu</h2>
                <p className="text-gray-600 leading-relaxed whitespace-pre-line">{event.description}</p>
              </div>
            )}

            {selectedShowtime && !hold && useSeatMap && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">Chọn ghế</h2>
                  <span className="text-xs text-gray-500">Tối đa {maxQuantity} ghế mỗi lượt</span>
                </div>
                <SeatMapCanvas
                  capacity={availability.capacity}
                  takenCount={availability.capacity - availability.available}
                  selected={seats}
                  maxSelect={maxQuantity}
                  onChange={setSeats}
                  disabled={busy || soldOut}
                />
                <SeatLegend />
              </div>
            )}
          </div>

          {/* Booking card */}
          <div>
            <div className="sticky top-20 card-auth space-y-5">
              <h3 className="font-bold text-gray-900">Chọn suất diễn</h3>

              <ShowtimeList
                showtimes={showtimes}
                selectedId={selectedId}
                onSelect={handleSelect}
                disabled={!!hold}
              />

              {selectedShowtime && !hold && (
                <div className="space-y-3">
                  {availability && (
                    <p className="text-xs text-gray-500">
                      Còn <strong>{availability.available}</strong> / {availability.capacity} chỗ
                    </p>
                  )}
                  {useSeatMap ? (
                    <p className="text-sm text-gray-700">
                      {seats.length > 0
                        ? <>Ghế đã chọn: <strong>{seats.map(seatName).join(', ')}</strong></>
                        : 'Hãy chọn ghế trên sơ đồ chỗ ngồi.'}
                    </p>
                  ) : (
                  <div className="flex items-center justify-between">
                    <label htmlFor="quantity" className="text-sm font-medium text-gray-700">Số vé</label>
                    <select
                      id="quantity"
                      value={Math.min(quantity, maxQuantity)}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      disabled={soldOut}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                    >
                      {Array.from({ length: maxQuantity }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Tạm tính</span>
                    <span className="font-bold text-gray-900">
                      {formatPrice(selectedShowtime.price * ticketCount)}
                    </span>
                  </div>
                  <button
                    onClick={handleHold}
                    disabled={busy || soldOut || ticketCount === 0}
                    className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {soldOut ? 'Hết chỗ' : busy ? 'Đang giữ chỗ…' : ticketCount ? `Giữ ${ticketCount} chỗ` : 'Giữ chỗ'}
                  </button>
                </div>
              )}

              {hold && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-700">
                    Đang giữ <strong>{heldCount}</strong> vé cho suất {formatDateTime(selectedShowtime?.starts_at)}.
                  </p>
                  {/* SCRUM-175: danh sách ghế đang giữ, bấm × để bỏ chọn từng ghế */}
                  {heldSeatIds.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                      {heldSeatIds.map((seatId) => (
                        <li
                          key={seatId}
                          className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-3 py-1 text-xs font-medium text-pink-700"
                        >
                          {seatName(seatId)}
                          <button
                            type="button"
                            onClick={() => handleReleaseSeat(seatId)}
                            disabled={busy}
                            aria-label={`Bỏ chọn ghế ${seatName(seatId)}`}
                            className="ml-1 text-pink-500 hover:text-red-600 disabled:opacity-50"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Tạm tính</span>
                    <span className="font-bold text-gray-900">
                      {formatPrice(selectedShowtime.price * heldCount)}
                    </span>
                  </div>
                  <SeatHoldTimer expiresAt={hold.expiresAt} onExpire={handleExpire} />
                  <Link to="/checkout" state={{ hold, event, showtime: selectedShowtime }} className="btn-primary block text-center">
                    Tiếp tục thanh toán
                  </Link>
                  <button
                    onClick={handleRelease}
                    disabled={busy}
                    className="w-full text-sm font-medium text-gray-500 hover:text-red-600"
                  >
                    Hủy giữ chỗ
                  </button>
                </div>
              )}

              {message && (
                <p className={`text-sm ${message.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                  {message.text}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
