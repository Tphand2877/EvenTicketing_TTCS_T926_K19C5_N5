import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  getAvailability, getCurrentSeatHold, getSeatHoldServerTime,
  getSeatMap, holdSeatIds, releaseHold, releaseSeat,
} from '../../services/eventService'
import SeatHoldTimer from '../seatmap/SeatHoldTimer'
import SeatLegend from '../seatmap/SeatLegend'
import SeatMapCanvas from '../seatmap/SeatMapCanvas'
import { seatName } from '../seatmap/seatUtils'
import ShowtimeList from './ShowtimeList'
import { formatDateTime, formatPrice, getCategoryStyle, getErrorMessage } from './eventFormat'

const MAX_TICKETS = 10

/**
 * Chi tiết sự kiện + khung đặt vé (SCRUM-80, SCRUM-84, SCRUM-165 / S-09)
 */
export default function EventDetail({ event, showtimes }) {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { color, emoji } = getCategoryStyle(event.category)

  const selectedId = useMemo(() => {
    const requestedId = new URLSearchParams(location.search).get('showtimeId')
    return showtimes.find((showtime) => String(showtime.id) === requestedId)?.id ?? null
  }, [location.search, showtimes])

  const [availability, setAvailability]     = useState(null)
  const [seatMap, setSeatMap]               = useState(null)
  const [seatMapStatus, setSeatMapStatus]   = useState('idle') // 'idle' | 'loading' | 'loaded' | 'not_on_sale' | 'unavailable'
  const [statusForId, setStatusForId]       = useState(null)
  const [hold, setHold]                     = useState(null)
  const [busy, setBusy]                     = useState(false)
  const [busySeatId, setBusySeatId]         = useState(null)
  const [clockOffsetMs, setClockOffsetMs]   = useState(0)
  const [message, setMessage]               = useState(null)
  const mapRequestId = useRef(0)

  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const selectedShowtime = showtimes.find((s) => s.id === selectedId)
  const visibleStatus = selectedId && statusForId !== selectedId ? 'loading' : seatMapStatus
  const activeHold = hold && Number(hold.showtimeId) === Number(selectedId) ? hold : null

  const refreshSeatMap = useCallback(async (showtimeId) => {
    const requestId = ++mapRequestId.current
    setStatusForId(showtimeId)
    setSeatMapStatus('loading')
    const startedAt = Date.now()
    try {
      let current = null
      let serverNow
      let mapData
      let sampledAt
      if (isAuthenticated) {
        current = await getCurrentSeatHold(showtimeId)
        sampledAt = Date.now()
        if (requestId !== mapRequestId.current) return
        serverNow = current.serverNow
        mapData = await getSeatMap(showtimeId)
      } else {
        serverNow = await getSeatHoldServerTime(showtimeId)
        sampledAt = Date.now()
        mapData = await getSeatMap(showtimeId)
      }
      if (requestId !== mapRequestId.current) return
      const serverMs = Date.parse(serverNow)
      const offset = Number.isFinite(serverMs) ? serverMs - (startedAt + sampledAt) / 2 : 0
      setClockOffsetMs(offset)
      setHold(current?.hold ? { ...current.hold, serverOffsetMs: offset } : null)
      if (Array.isArray(mapData?.seats) && mapData.seats.length > 0) {
        setSeatMap(mapData.seats)
        setSeatMapStatus('loaded')
      } else {
        setSeatMap(null)
        setSeatMapStatus('not_on_sale')
      }
    } catch (error) {
      if (requestId !== mapRequestId.current) return
      setSeatMap(null)
      setHold(null)
      setSeatMapStatus([404, 409].includes(error?.response?.status) ? 'not_on_sale' : 'unavailable')
    }
  }, [isAuthenticated])

  useEffect(() => {
    mapRequestId.current += 1
    setSeatMap(null)
    setHold(null)
    setAvailability(null)
    setMessage(null)
    if (!selectedId) {
      setStatusForId(null)
      setSeatMapStatus('idle')
      return undefined
    }
    if (authLoading) {
      setStatusForId(selectedId)
      setSeatMapStatus('loading')
      return undefined
    }
    refreshSeatMap(selectedId)
    const requestId = mapRequestId.current
    getAvailability(selectedId).then((value) => {
      if (mapRequestId.current === requestId) setAvailability(value)
    }).catch(() => {
      if (mapRequestId.current === requestId) setAvailability(null)
    })
    return () => { mapRequestId.current += 1 }
  }, [selectedId, authLoading, refreshSeatMap])

  const handleSelect = (id) => {
    const params = new URLSearchParams(location.search)
    params.set('showtimeId', String(id))
    navigate(`${location.pathname}?${params.toString()}${location.hash}`, { replace: true })
  }

  const handleSeatToggle = async (seat) => {
    if (!selectedId || busySeatId !== null || visibleStatus !== 'loaded') return
    const targetShowtimeId = selectedId
    const currentIds = activeHold?.seatIds || []
    const isMine = currentIds.some((id) => Number(id) === Number(seat.id))
    if (!isMine && seat.status !== 'available') return
    if (!isMine && currentIds.length >= MAX_TICKETS) return
    if (!isAuthenticated) {
      navigate(`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`)
      return
    }
    setBusySeatId(seat.id)
    setMessage(null)
    try {
      if (isMine) {
        await releaseSeat(targetShowtimeId, activeHold.id, seat.id)
      } else {
        await holdSeatIds(targetShowtimeId, [...currentIds.map(Number), Number(seat.id)])
      }
      if (selectedIdRef.current === targetShowtimeId) await refreshSeatMap(targetShowtimeId)
    } catch (error) {
      if (selectedIdRef.current === targetShowtimeId) {
        setMessage({ type: 'error', text: getErrorMessage(error, 'Không thể cập nhật giữ chỗ.') })
        await refreshSeatMap(targetShowtimeId)
      }
    } finally {
      setBusySeatId(null)
    }
  }

  const handleRelease = async () => {
    if (!activeHold || busy) return
    const targetShowtimeId = selectedId
    setBusy(true)
    setMessage(null)
    try {
      await releaseHold(activeHold.id)
    } catch (error) {
      if (selectedIdRef.current === targetShowtimeId) {
        setMessage({ type: 'error', text: getErrorMessage(error, 'Không thể hủy lượt giữ chỗ.') })
      }
    } finally {
      setBusy(false)
      if (selectedIdRef.current === targetShowtimeId) await refreshSeatMap(targetShowtimeId)
    }
  }

  const handleExpire = useCallback(async () => {
    setHold(null)
    setMessage({ type: 'error', text: 'Hết thời gian giữ chỗ. Vui lòng chọn lại.' })
    if (selectedId) await refreshSeatMap(selectedId)
  }, [selectedId, refreshSeatMap])

  const heldSeatIds = activeHold?.seatIds ?? []
  const heldSeats = useMemo(() => {
    if (!activeHold || !seatMap || visibleStatus !== 'loaded') return []
    const ids = new Set(activeHold.seatIds.map(Number))
    return seatMap.filter((seat) => ids.has(Number(seat.id)))
  }, [activeHold, seatMap, visibleStatus])
  const heldSeatNames = heldSeats.map(seatName)
  const hasPrices = heldSeats.length === (activeHold?.quantity || 0)
    && heldSeats.every((seat) => seat.price != null && Number.isFinite(Number(seat.price)))
  const totalPrice = hasPrices ? heldSeats.reduce((sum, seat) => sum + Number(seat.price), 0) : null
  const soldOut = visibleStatus === 'loaded' && seatMap?.every((seat) => seat.status !== 'available')
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

            {/* Sơ đồ thật từ T-19; chờ khôi phục hold trước khi hiển thị. */}
            {selectedShowtime && (
              <>
                {visibleStatus === 'loading' && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
                    <div className="inline-block w-8 h-8 border-3 border-pink-200 border-t-pink-600 rounded-full animate-spin mb-2" />
                    <p className="text-sm text-gray-500">Đang tải sơ đồ ghế...</p>
                  </div>
                )}
                {visibleStatus === 'not_on_sale' && (
                  <div role="alert" className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center text-amber-800 space-y-2 shadow-sm">
                    <div className="text-3xl" aria-hidden="true">⚠️</div>
                    <h3 className="font-semibold text-base">Suất diễn chưa mở bán</h3>
                    <p className="text-xs text-amber-700">Suất diễn này chưa được nạp sơ đồ ghế hoặc chưa mở bán vé. Vui lòng quay lại sau!</p>
                  </div>
                )}
                {visibleStatus === 'unavailable' && (
                  <div role="alert" className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center text-amber-800 space-y-2 shadow-sm">
                    <h3 className="font-semibold text-base">Chưa tải được sơ đồ ghế</h3>
                    <p className="text-xs text-amber-700">Vui lòng thử lại khi dữ liệu ghế sẵn sàng.</p>
                    <button type="button" onClick={() => refreshSeatMap(selectedId)} className="text-sm underline">Thử lại</button>
                  </div>
                )}
                {visibleStatus === 'loaded' && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">Chọn ghế</h2>
                        <span className="text-xs text-gray-500">Tối đa {MAX_TICKETS} ghế mỗi lượt &bull; {seatMap.length} ghế</span>
                      </div>
                      <SeatLegend />
                    </div>
                    <SeatMapCanvas
                      seats={seatMap}
                      selectedSeatIds={heldSeatIds}
                      maxSelect={MAX_TICKETS}
                      onSeatToggle={handleSeatToggle}
                      disabled={busy || busySeatId !== null}
                      onRefresh={() => refreshSeatMap(selectedId)}
                    />
                  </div>
                )}
              </>
            )}          </div>

          {/* Booking card */}
          <div>
            <div className="sticky top-20 card-auth space-y-5">
              <h3 className="font-bold text-gray-900">Chọn suất diễn</h3>

              <ShowtimeList
                showtimes={showtimes}
                selectedId={selectedId}
                onSelect={handleSelect}
                disabled={!!activeHold}
              />

              {selectedShowtime && !activeHold && (
                <div className="space-y-3">
                  {availability && (
                    <p className="text-xs text-gray-500">Còn <strong>{availability.available}</strong> / {availability.capacity} chỗ</p>
                  )}
                  {visibleStatus === 'loaded' && (
                    <p className="text-sm text-gray-700">
                      {soldOut ? 'Hiện không còn ghế trống.' : 'Chọn ghế trên sơ đồ để giữ ngay và bắt đầu đồng hồ.'}
                    </p>
                  )}
                  {visibleStatus === 'not_on_sale' && (
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-center">
                      <p className="text-xs font-semibold text-amber-800">Suất diễn chưa mở bán</p>
                      <p className="text-[11px] text-amber-600 mt-0.5">Không thể chọn ghế lúc này.</p>
                    </div>
                  )}
                </div>
              )}

              {activeHold && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-700">
                    Đang giữ <strong>{activeHold.quantity}</strong> vé cho suất {formatDateTime(selectedShowtime?.starts_at)}.
                  </p>
                  {heldSeatIds.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                      {heldSeatIds.map((seatId) => {
                        const seat = heldSeats.find((item) => Number(item.id) === Number(seatId))
                        return (
                          <li key={seatId} className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-3 py-1 text-xs font-medium text-pink-700">
                            {seat ? seatName(seat) : `#${seatId}`}
                            <button
                              type="button"
                              onClick={() => seat && handleSeatToggle(seat)}
                              disabled={busy || busySeatId !== null || !seat}
                              aria-label={`Bỏ chọn ghế ${seat ? seatName(seat) : seatId}`}
                              className="ml-1 text-pink-500 hover:text-red-600 disabled:opacity-50"
                            >
                              ×
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Tạm tính</span>
                    <span className="font-bold text-gray-900">{formatPrice(totalPrice)}</span>
                  </div>
                  <SeatHoldTimer
                    expiresAt={activeHold.expiresAt}
                    serverOffsetMs={clockOffsetMs}
                    onExpire={handleExpire}
                  />
                  {heldSeats.length === activeHold.quantity && (
                    <Link
                      to="/checkout"
                      state={{ hold: { ...activeHold, seats: heldSeatNames, serverOffsetMs: clockOffsetMs }, event, showtime: selectedShowtime }}
                      className="btn-primary block text-center"
                    >
                      Tiếp tục thanh toán
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={handleRelease}
                    disabled={busy || busySeatId !== null}
                    className="w-full text-sm font-medium text-gray-500 hover:text-red-600 disabled:opacity-50"
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
