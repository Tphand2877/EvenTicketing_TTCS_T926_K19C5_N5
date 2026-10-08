import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  getCurrentSeatHold,
  getSeatHoldServerTime,
  getSeatMap,
  holdSeatIds,
  releaseHold,
  releaseSeat,
} from '../../services/eventService'
import SeatHoldTimer from '../seatmap/SeatHoldTimer'
import SeatLegend from '../seatmap/SeatLegend'
import SeatMapCanvas from '../seatmap/SeatMapCanvas'
import ShowtimeList from './ShowtimeList'
import { formatDateTime, formatPrice, getCategoryStyle, getErrorMessage } from './eventFormat'

const seatName = (seat) => `${seat.row}${seat.number}`

/** Event details with seat-specific holds and one shared server deadline (S-10). */
export default function EventDetail({ event, showtimes }) {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { color, emoji } = getCategoryStyle(event.category)

  const selectedId = useMemo(() => {
    const requestedId = new URLSearchParams(location.search).get('showtimeId')
    return showtimes.find((showtime) => String(showtime.id) === requestedId)?.id ?? null
  }, [location.search, showtimes])
  const [seatMap, setSeatMap] = useState(null)
  const [hold, setHold] = useState(null)
  const [clockOffsetMs, setClockOffsetMs] = useState(0)
  const [mapLoading, setMapLoading] = useState(false)
  const [busySeatId, setBusySeatId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [mapError, setMapError] = useState(null)
  const [message, setMessage] = useState(null)
  const mapRequestId = useRef(0)

  const selectedShowtime = showtimes.find((showtime) => showtime.id === selectedId)

  const refreshSeatMap = useCallback(async (showtimeId) => {
    const requestId = ++mapRequestId.current
    setMapLoading(true)
    setMapError(null)
    const requestStartedAt = Date.now()
    try {
      let mapData
      let serverNow
      let restoredHold = null
      let offsetMs = 0

      if (isAuthenticated) {
        // Restore the server-owned hold before requesting/rendering the seat map.
        const current = await getCurrentSeatHold(showtimeId)
        const holdReceivedAt = Date.now()
        if (requestId !== mapRequestId.current) return
        serverNow = current.serverNow
        const serverTimestamp = Date.parse(serverNow)
        const midpoint = (requestStartedAt + holdReceivedAt) / 2
        offsetMs = Number.isFinite(serverTimestamp) ? serverTimestamp - midpoint : 0
        restoredHold = current.hold ? { ...current.hold, serverOffsetMs: offsetMs } : null
        mapData = await getSeatMap(showtimeId)
      } else {
        [mapData, serverNow] = await Promise.all([
          getSeatMap(showtimeId),
          getSeatHoldServerTime(showtimeId),
        ])
        const responseReceivedAt = Date.now()
        const serverTimestamp = Date.parse(serverNow)
        const midpoint = (requestStartedAt + responseReceivedAt) / 2
        offsetMs = Number.isFinite(serverTimestamp) ? serverTimestamp - midpoint : 0
      }
      if (requestId !== mapRequestId.current) return

      setSeatMap(mapData)
      setHold(restoredHold)
      setClockOffsetMs(offsetMs)
    } catch (error) {
      if (requestId !== mapRequestId.current) return
      setSeatMap(null)
      setMapError(getErrorMessage(error, 'Không tải được sơ đồ ghế.'))
    } finally {
      if (requestId === mapRequestId.current) setMapLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    setSeatMap(null)
    setHold(null)
    setMapError(null)
    setMessage(null)
    if (!selectedId) {
      setMapLoading(false)
      return undefined
    }
    if (authLoading) {
      setMapLoading(true)
      return () => { mapRequestId.current += 1 }
    }

    refreshSeatMap(selectedId)
    return () => { mapRequestId.current += 1 }
  }, [selectedId, authLoading, refreshSeatMap])

  const handleSelectShowtime = (id) => {
    const params = new URLSearchParams(location.search)
    params.set('showtimeId', String(id))
    navigate(`${location.pathname}?${params.toString()}${location.hash}`, { replace: true })
    setHold(null)
    setMessage(null)
  }

  const handleSeatToggle = async (seat) => {
    if (!selectedId || busySeatId !== null || mapLoading) return
    const currentIds = hold?.seatIds || []
    const isMine = currentIds.some((id) => Number(id) === Number(seat.id))

    if (!isMine && seat.status !== 'available') return
    if (!isMine && !isAuthenticated) {
      const returnTo = encodeURIComponent(location.pathname + location.search)
      navigate(`/login?returnTo=${returnTo}`)
      return
    }
    setBusySeatId(seat.id)
    setMessage(null)
    try {
      if (isMine) {
        const updatedHold = await releaseSeat(selectedId, hold.id, seat.id)
        setHold(updatedHold ? { ...updatedHold, serverOffsetMs: clockOffsetMs } : null)
      } else {
        const nextSeatIds = [...new Set([...currentIds.map(Number), Number(seat.id)])]
        const updatedHold = await holdSeatIds(selectedId, nextSeatIds)
        setHold({ ...updatedHold, serverOffsetMs: clockOffsetMs })
      }
      await refreshSeatMap(selectedId)
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Không thể cập nhật giữ chỗ.') })
      if (error.response?.status === 409) await refreshSeatMap(selectedId)
    } finally {
      setBusySeatId(null)
    }
  }

  const handleRelease = async () => {
    if (!hold) return
    setBusy(true)
    setMessage(null)
    try {
      await releaseHold(hold.id)
      setHold(null)
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Không thể hủy lượt giữ chỗ.') })
      setHold(null)
    } finally {
      setBusy(false)
      if (selectedId) await refreshSeatMap(selectedId)
    }
  }

  const handleExpire = useCallback(async () => {
    setHold(null)
    setMessage({ type: 'error', text: 'Hết thời gian giữ chỗ. Sơ đồ ghế đang được cập nhật.' })
    if (selectedId) await refreshSeatMap(selectedId)
  }, [selectedId, refreshSeatMap])

  const heldSeats = useMemo(() => {
    if (!hold || !seatMap?.seats) return []
    const ids = new Set(hold.seatIds.map(Number))
    return seatMap.seats.filter((seat) => ids.has(Number(seat.id)))
  }, [hold, seatMap])
  const heldSeatNames = heldSeats.map(seatName)
  const hasPrices = heldSeats.length === (hold?.quantity || 0)
    && heldSeats.every((seat) => seat.price !== null && seat.price !== undefined && Number.isFinite(Number(seat.price)))
  const totalPrice = hasPrices ? heldSeats.reduce((sum, seat) => sum + Number(seat.price), 0) : null

  return (
    <>
      <div className={`relative flex h-72 items-center justify-center overflow-hidden bg-gradient-to-br ${color} text-white`}>
        {event.image_url
          ? <img src={event.image_url} alt={event.title} className="absolute inset-0 h-full w-full object-cover" />
          : <span className="text-8xl">{emoji}</span>}
        <div className="absolute inset-0 bg-black/20" />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div>
              <span className="mb-3 inline-block rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-600">
                {event.category}
              </span>
              <h1 className="text-3xl font-bold text-gray-900">{event.title}</h1>
              {event.organizer_name && <p className="mt-1 text-sm text-gray-500">Ban tổ chức: {event.organizer_name}</p>}
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
              <span>{formatDateTime(event.next_starts_at)}</span>
              <span>{event.venue}</span>
            </div>

            {event.description && (
              <div>
                <h2 className="mb-3 text-lg font-semibold text-gray-900">Giới thiệu</h2>
                <p className="whitespace-pre-line leading-relaxed text-gray-600">{event.description}</p>
              </div>
            )}

            {selectedShowtime && (
              <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">Chọn ghế</h2>
                </div>
                {mapLoading && <p className="text-sm text-gray-500">Đang tải sơ đồ ghế…</p>}
                {!mapLoading && mapError && <p role="alert" className="text-sm text-red-600">{mapError}</p>}
                {!mapLoading && seatMap && (
                  <>
                    <SeatMapCanvas
                      seats={seatMap.seats}
                      selectedSeatIds={hold?.seatIds || []}
                      onSeatToggle={handleSeatToggle}
                      disabled={busy || busySeatId !== null}
                    />
                    <SeatLegend />
                    <p className="text-xs text-gray-500">
                      Chọn một ghế để giữ ngay. Ghế trùng hoặc vừa được người khác giữ sẽ bị từ chối và sơ đồ tự cập nhật.
                    </p>
                  </>
                )}
              </section>
            )}
          </div>

          <aside>
            <div className="sticky top-20 space-y-5 rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="font-bold text-gray-900">Chọn suất diễn</h2>
              <ShowtimeList
                showtimes={showtimes}
                selectedId={selectedId}
                onSelect={handleSelectShowtime}
                disabled={!!hold || busy}
              />

              {selectedShowtime && !hold && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">{formatDateTime(selectedShowtime.starts_at)}</p>
                  <p className="text-sm text-gray-700">
                    {isAuthenticated
                      ? 'Chọn ghế trên sơ đồ; đồng hồ bắt đầu khi ghế đầu tiên được giữ.'
                      : 'Bạn có thể xem sơ đồ. Đăng nhập để giữ ghế.'}
                  </p>
                  {message && <p role="alert" className="text-sm text-red-600">{message.text}</p>}
                </div>
              )}

              {hold && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-700">
                    Đang giữ <strong>{hold.quantity}</strong> ghế: <strong>{heldSeatNames.join(', ') || 'đang tải…'}</strong>
                  </p>
                  <SeatHoldTimer
                    expiresAt={hold.expiresAt}
                    serverOffsetMs={clockOffsetMs}
                    onExpire={handleExpire}
                  />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Tạm tính</span>
                    <span className="font-bold text-gray-900">{formatPrice(totalPrice)}</span>
                  </div>
                  <Link
                    to="/checkout"
                    state={{
                      hold: { ...hold, seats: heldSeatNames, serverOffsetMs: clockOffsetMs },
                      event,
                      showtime: selectedShowtime,
                    }}
                    className="btn-primary block text-center"
                  >
                    Tiếp tục thanh toán
                  </Link>
                  <button
                    type="button"
                    onClick={handleRelease}
                    disabled={busy}
                    className="w-full text-sm font-medium text-gray-500 hover:text-red-600 disabled:opacity-50"
                  >
                    Hủy toàn bộ lượt giữ
                  </button>
                  {message && <p role="alert" className="text-sm text-red-600">{message.text}</p>}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}
