import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
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

const seatName = (seat) => {
  if (typeof seat === 'object' && seat !== null) {
    return `${seat.row}${seat.number}`
  }
  return String(seat)
}

/**
 * Chi tiết sự kiện + sơ đồ ghế + giữ chỗ từng ghế (S-10, S-15, SCRUM-165 / S-09, SCRUM-175).
 */
export default function EventDetail({ event, showtimes }) {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { color, emoji } = getCategoryStyle(event.category)

  const initialShowtimeId = (() => {
    const params = new URLSearchParams(location.search)
    const stId = params.get('showtimeId')
    if (stId && /^\d+$/.test(stId)) {
      const parsed = Number(stId)
      return showtimes.some((s) => s.id === parsed) ? parsed : null
    }
    return null
  })()

  const [selectedId, setSelectedId] = useState(initialShowtimeId)
  const [seatMap, setSeatMap] = useState(null)
  const [hold, setHold] = useState(null)
  const [clockOffsetMs, setClockOffsetMs] = useState(0)
  const [mapLoading, setMapLoading] = useState(false)
  const [busySeatId, setBusySeatId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [mapError, setMapError] = useState(null)
  const [message, setMessage] = useState(null)
  const [showStageMap, setShowStageMap] = useState(true)
  const [zoomStageMap, setZoomStageMap] = useState(false)
  const mapRequestId = useRef(0)

  const selectedShowtime = showtimes.find((showtime) => showtime.id === selectedId)

  const refreshSeatMap = useCallback(async (showtimeId) => {
    if (!showtimeId) return
    const requestId = ++mapRequestId.current
    setMapLoading(true)
    setMapError(null)
    const requestStartedAt = Date.now()
    try {
      const [mapData, serverNow] = await Promise.all([
        getSeatMap(showtimeId),
        getSeatHoldServerTime(showtimeId),
      ])
      const responseReceivedAt = Date.now()
      if (requestId !== mapRequestId.current) return

      const serverTimestamp = Date.parse(serverNow)
      const midpoint = (requestStartedAt + responseReceivedAt) / 2
      setSeatMap(mapData)
      setClockOffsetMs(Number.isFinite(serverTimestamp) ? serverTimestamp - midpoint : 0)
    } catch (error) {
      if (requestId !== mapRequestId.current) return
      setSeatMap(null)
      const status = error.response?.status
      if (status === 409 || status === 404) {
        setMapError('Suất diễn này chưa được nạp sơ đồ ghế hoặc chưa mở bán.')
      } else {
        setMapError(getErrorMessage(error, 'Không tải được sơ đồ ghế.'))
      }
    } finally {
      if (requestId === mapRequestId.current) setMapLoading(false)
    }
  }, [])

  useEffect(() => {
    setSeatMap(null)
    setMapError(null)
    setMessage(null)
    if (!selectedId) return undefined

    refreshSeatMap(selectedId)
    return () => { mapRequestId.current += 1 }
  }, [selectedId, refreshSeatMap])

  const handleSelectShowtime = (id) => {
    setSelectedId(id)
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

  const handleReleaseSeat = async (seatId) => {
    if (!hold || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const updatedHold = await releaseSeat(selectedId, hold.id, seatId)
      setHold(updatedHold ? { ...updatedHold, serverOffsetMs: clockOffsetMs } : null)
      await refreshSeatMap(selectedId)
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Không thể bỏ chọn ghế.') })
    } finally {
      setBusy(false)
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

  const seatsList = useMemo(() => {
    return seatMap?.seats || (Array.isArray(seatMap) ? seatMap : [])
  }, [seatMap])

  const heldSeats = useMemo(() => {
    if (!hold || !seatsList.length) return []
    const ids = new Set((hold.seatIds || []).map(Number))
    return seatsList.filter((seat) => ids.has(Number(seat.id)))
  }, [hold, seatsList])

  const heldSeatNames = heldSeats.map(seatName)

  // S-15 / AC1: Tổng tiền tính theo giá từng hạng ghế đã chọn hoặc từ giá suất diễn
  const hasPrices = heldSeats.length > 0
    && heldSeats.every((seat) => seat.price !== null && seat.price !== undefined && Number.isFinite(Number(seat.price)))
  const totalPrice = hasPrices
    ? heldSeats.reduce((sum, seat) => sum + Number(seat.price), 0)
    : (selectedShowtime?.price ? (Number(selectedShowtime.price) * (hold?.quantity || heldSeats.length)) : null)

  // S-15: Tóm tắt giá các hạng ghế từ sơ đồ
  const categoryPricesSummary = useMemo(() => {
    if (!Array.isArray(seatsList) || seatsList.length === 0) return []
    const map = new Map()
    for (const s of seatsList) {
      if (s.category && !map.has(s.category)) {
        map.set(s.category, s.price)
      }
    }
    return Array.from(map.entries()).map(([name, price]) => ({ name, price }))
  }, [seatsList])

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
              <>
                {/* Sơ đồ khán đài sân khấu tổng quan (do Organizer thêm hoặc mặc định) */}
                {(event.stage_map_url || seatMap?.stage_map_url || true) && (
                  <div className="rounded-2xl border border-pink-100 bg-gradient-to-br from-pink-50/50 via-white to-purple-50/30 p-4 shadow-sm space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-pink-600 font-bold text-sm sm:text-base">🏟️ Sơ đồ khán đài sân khấu</span>
                        <span className="text-[11px] text-gray-500 hidden sm:inline">(Đối chiếu vị trí khán đài, sân khấu & cổng vào)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setZoomStageMap(true)}
                          className="text-xs text-pink-600 hover:text-pink-700 font-semibold flex items-center gap-1 bg-white px-2.5 py-1.5 rounded-lg border border-pink-200 shadow-xs active:scale-95 transition-all"
                        >
                          <span>🔍</span>
                          <span>Phóng to</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowStageMap((v) => !v)}
                          className="text-xs text-gray-600 hover:text-gray-900 font-medium bg-white px-2.5 py-1.5 rounded-lg border border-gray-200 active:scale-95 transition-all"
                        >
                          {showStageMap ? 'Thu gọn ▲' : 'Xem ảnh sơ đồ ▼'}
                        </button>
                      </div>
                    </div>

                    {showStageMap && (
                      <>
                        <div
                          className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-900 cursor-zoom-in max-h-[380px] flex items-center justify-center group"
                          onClick={() => setZoomStageMap(true)}
                          title="Bấm để phóng to sơ đồ khán đài"
                        >
                          <img
                            src={event.stage_map_url || seatMap?.stage_map_url || '/images/sample-stage-map.png'}
                            alt="Sơ đồ khán đài sân khấu"
                            onError={(e) => {
                              if (!e.target.src.endsWith('/images/sample-stage-map.png')) {
                                e.target.src = '/images/sample-stage-map.png';
                              }
                            }}
                            className="w-full h-auto max-h-[380px] object-contain transition-transform duration-300 group-hover:scale-102"
                          />
                          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] px-2.5 py-1 rounded-md backdrop-blur-sm pointer-events-none">
                            🔍 Bấm vào ảnh để phóng to
                          </div>
                        </div>

                        {/* Chú thích từng phân khu ứng với ghế có thể đặt */}
                        <div className="pt-2">
                          <p className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                            <span>📌</span>
                            <span>Chú thích phân khu ứng với các ghế có thể đặt bên dưới:</span>
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div className="p-3 rounded-xl bg-pink-50 border border-pink-200 text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-pink-900 flex items-center gap-1">
                                  <span>⭐</span>
                                  <span>Khu vực VIP (Cận sân khấu)</span>
                                </span>
                                <span className="font-bold text-pink-600">500.000đ</span>
                              </div>
                              <p className="text-pink-800">
                                Ghế trên sơ đồ: <strong>Hàng A &amp; Hàng B</strong> (A1 - A20, B1 - B20)
                              </p>
                              <p className="text-[11px] text-pink-600">
                                Vị trí chính diện sân khấu &bull; Lối vào Cổng 1 (Ưu tiên)
                              </p>
                            </div>

                            <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-sky-900 flex items-center gap-1">
                                  <span>🎫</span>
                                  <span>Khu vực Khán đài Tiêu chuẩn</span>
                                </span>
                                <span className="font-bold text-sky-600">300.000đ</span>
                              </div>
                              <p className="text-sky-800">
                                Ghế trên sơ đồ: <strong>Hàng C đến Hàng O</strong> (C1 đến O20)
                              </p>
                              <p className="text-[11px] text-sky-600">
                                Tầm nhìn bao quát toàn bộ sự kiện &bull; Lối vào Cổng 1 &amp; Cổng 2
                              </p>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Modal phóng to toàn màn hình sơ đồ khán đài */}
                {zoomStageMap && (
                  <div
                    className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
                    onClick={() => setZoomStageMap(false)}
                  >
                    <div className="relative max-w-5xl w-full max-h-[92vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
                      <div className="w-full flex items-center justify-between text-white pb-2 px-2">
                        <span className="font-bold text-sm sm:text-base">Sơ đồ khán đài sân khấu (Toàn cảnh)</span>
                        <button
                          type="button"
                          onClick={() => setZoomStageMap(false)}
                          className="text-white hover:text-pink-400 text-lg font-bold bg-white/20 hover:bg-white/30 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                      <img
                        src={event.stage_map_url || seatMap?.stage_map_url || '/images/sample-stage-map.png'}
                        alt="Sơ đồ khán đài sân khấu phóng to"
                        onError={(e) => {
                          if (!e.target.src.endsWith('/images/sample-stage-map.png')) {
                            e.target.src = '/images/sample-stage-map.png';
                          }
                        }}
                        className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl bg-black"
                      />
                    </div>
                  </div>
                )}

                <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">Chọn ghế</h2>
                  <span className="text-xs text-gray-500">
                    {seatsList.length > 0 && `${seatsList.length} ghế`}
                  </span>
                </div>

                {mapLoading && (
                  <div className="py-8 text-center">
                    <div className="inline-block w-8 h-8 border-3 border-pink-200 border-t-pink-600 rounded-full animate-spin mb-2" />
                    <p className="text-sm text-gray-500">Đang tải sơ đồ ghế…</p>
                  </div>
                )}

                {!mapLoading && mapError && (
                  <div role="alert" className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-center text-amber-800">
                    <p className="text-sm font-semibold">{mapError}</p>
                  </div>
                )}

                {!mapLoading && seatsList.length > 0 && (
                  <>
                    {/* S-15: Danh sách giá vé từng hạng */}
                    {categoryPricesSummary.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100">
                        <span className="text-xs font-medium text-gray-500">Bảng giá từng hạng:</span>
                        {categoryPricesSummary.map(({ name, price }) => (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 border border-gray-200 text-gray-700 shadow-xs"
                          >
                            <span className="w-2 h-2 rounded-full bg-pink-500" />
                            <span>{name}:</span>
                            <span className="text-pink-600 font-bold">
                              {price != null ? formatPrice(price) : 'Chưa định giá'}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}

                    <SeatMapCanvas
                      seats={seatsList}
                      selectedSeatIds={hold?.seatIds || []}
                      onSeatToggle={handleSeatToggle}
                      disabled={busy || busySeatId !== null}
                      onRefresh={() => refreshSeatMap(selectedId)}
                    />
                    <SeatLegend />
                    <p className="text-xs text-gray-500">
                      Chọn một ghế để giữ ngay. Ghế trùng hoặc vừa được người khác giữ sẽ bị từ chối và sơ đồ tự cập nhật.
                    </p>
                  </>
                )}
              </section>
              </>
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

                  {/* SCRUM-175: Danh sách ghế đang giữ với nút × để bỏ chọn từng ghế */}
                  {heldSeats.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                      {heldSeats.map((seat) => (
                        <li
                          key={seat.id}
                          className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-3 py-1 text-xs font-medium text-pink-700"
                        >
                          {seatName(seat)}
                          {seat.price != null && (
                            <span className="text-[11px] text-pink-500 font-semibold">
                              ({formatPrice(seat.price)})
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleReleaseSeat(seat.id)}
                            disabled={busy}
                            aria-label={`Bỏ chọn ghế ${seatName(seat)}`}
                            className="ml-1 text-pink-500 hover:text-red-600 disabled:opacity-50 font-bold"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <SeatHoldTimer
                    expiresAt={hold.expiresAt}
                    serverOffsetMs={clockOffsetMs}
                    onExpire={handleExpire}
                  />

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Tạm tính</span>
                    <span className="font-bold text-gray-900">
                      {totalPrice != null ? formatPrice(totalPrice) : '---'}
                    </span>
                  </div>

                  <Link
                    to="/checkout"
                    state={{
                      hold: {
                        ...hold,
                        seats: heldSeatNames,
                        serverOffsetMs: clockOffsetMs,
                        totalPrice,
                      },
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
