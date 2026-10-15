
import { useMemo, useState } from 'react'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.2
const ZOOM_STEP = 0.15

/**
 * SCRUM-165 (T-20): Sơ đồ ghế trên trình duyệt kèm màu và ký hiệu trạng thái:
 * - Trống: màu xanh lá/trắng, ký hiệu '○'
 * - Đang có người giữ: màu vàng hổ phách, ký hiệu '⏳'
 * - Đã bán: màu xám, ký hiệu '✕'
 * - Đang chọn: màu hồng tím, ký hiệu '✓'
 *
 * AC5: Hỗ trợ phóng to thu nhỏ trên điện thoại/màn hình nhỏ và bấm trúng ghế chính xác.
 * AC4: Tối ưu hóa hiển thị 2000 ghế dưới 2 giây.
 */
export default function SeatMapCanvas({
  seats: rawSeats,
  selectedSeatIds = [],
  maxSelect = 10,
  onSeatToggle,
  disabled = false,
  onRefresh,
}) {
  const [zoom, setZoom] = useState(1.0)

  // Chỉ hiển thị ghế có ID thật từ inventory; ghế mô phỏng không thể giữ an toàn.
  const normalizedSeats = useMemo(() => {
    return Array.isArray(rawSeats) ? rawSeats : []
  }, [rawSeats])

  // Nhóm ghế theo hàng (row) để vẽ lưới
  const rowsGrouped = useMemo(() => {
    const map = new Map()
    for (const seat of normalizedSeats) {
      const r = seat.row || 'A'
      if (!map.has(r)) {
        map.set(r, [])
      }
      map.get(r).push(seat)
    }

    return Array.from(map.entries()).map(([rowName, rowSeats]) => ({
      rowName,
      seats: rowSeats.sort((a, b) => a.number - b.number),
    }))
  }, [normalizedSeats])

  const selectedIds = useMemo(() => new Set(selectedSeatIds.map(Number)), [selectedSeatIds])

  const toggleSeat = (seat) => {
    const isSelected = selectedIds.has(Number(seat.id))
    if (disabled || (!isSelected && seat.status !== 'available')) return
    if (!isSelected && selectedIds.size >= maxSelect) return
    onSeatToggle?.(seat)
  }

  const handleZoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, parseFloat((z + ZOOM_STEP).toFixed(2))))
  const handleZoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, parseFloat((z - ZOOM_STEP).toFixed(2))))
  const handleResetZoom = () => setZoom(1.0)

  if (normalizedSeats.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      {/* Thanh điều khiển Zoom cho điện thoại & desktop (AC5) */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs">
        <div className="flex items-center gap-2 text-gray-700">
          <span className="font-medium">Kích thước sơ đồ:</span>
          <span className="font-semibold text-pink-600 bg-white px-2 py-0.5 rounded border border-gray-200">
            {Math.round(zoom * 100)}%
          </span>
          <span className="text-[11px] text-gray-400 hidden sm:inline">
            (Có thể phóng to thu nhỏ trên điện thoại để bấm chính xác)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            title="Thu nhỏ sơ đồ (-)"
            aria-label="Thu nhỏ sơ đồ"
            className="w-7 h-7 rounded bg-white border border-gray-300 hover:bg-gray-100 disabled:opacity-40 flex items-center justify-center font-bold text-gray-700 text-sm active:scale-95 transition-transform"
          >
            -
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            title="Đặt lại kích thước 100%"
            aria-label="Đặt lại kích thước 100%"
            className="px-2 h-7 rounded bg-white border border-gray-300 hover:bg-gray-100 text-[11px] font-medium text-gray-700 flex items-center justify-center active:scale-95 transition-transform"
          >
            100%
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            title="Phóng to sơ đồ (+)"
            aria-label="Phóng to sơ đồ"
            className="w-7 h-7 rounded bg-white border border-gray-300 hover:bg-gray-100 disabled:opacity-40 flex items-center justify-center font-bold text-gray-700 text-sm active:scale-95 transition-transform"
          >
            +
          </button>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              title="Làm mới trạng thái sơ đồ ghế"
              aria-label="Làm mới trạng thái sơ đồ ghế"
              className="ml-1 px-2.5 h-7 rounded bg-white border border-gray-300 hover:bg-gray-100 text-[11px] font-medium text-gray-700 flex items-center gap-1 active:scale-95 transition-transform"
            >
              <span>↻</span>
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          )}
        </div>
      </div>

      {/* Sân khấu */}
      <div className="text-center text-[10px] font-semibold tracking-widest text-gray-400 uppercase select-none">
        <div className="mx-auto mb-1.5 h-2 w-2/3 max-w-md rounded-full bg-gradient-to-r from-violet-500 via-pink-500 to-amber-400 shadow-sm" />
        Sân khấu
      </div>

      {/* Vùng sơ đồ ghế cuộn được với zoom transform (AC5, AC1) */}
      <div
        className="overflow-auto border border-gray-200 rounded-2xl bg-white p-4 max-h-[560px] shadow-inner select-none"
        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' }}
      >
        <div
          className="inline-flex flex-col gap-2 min-w-full items-center transition-transform duration-150 origin-top"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
        >
          {rowsGrouped.map(({ rowName, seats }) => (
            <div key={rowName} className="flex items-center gap-2">
              <span className="w-8 text-[11px] font-bold text-gray-400 text-right shrink-0">
                {rowName}
              </span>

              <div className="flex items-center gap-1.5">
                {seats.map((seat) => {
                  const isSelected = selectedIds.has(Number(seat.id))
                  const isHeld = seat.status === 'held'
                  const isSold = seat.status === 'sold'
                  const isAvailable = seat.status === 'available'
                  const full = !isSelected && selectedIds.size >= maxSelect

                  let statusText = 'Còn trống'
                  let symbol = '○'
                  let stateClass = 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-500'

                  if (isSold) {
                    statusText = 'Đã bán'
                    symbol = '✕'
                    stateClass = 'bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed opacity-80'
                  } else if (isSelected) {
                    statusText = 'Bạn đang giữ'
                    symbol = '✓'
                    stateClass = 'bg-pink-600 border-pink-600 text-white font-bold ring-2 ring-pink-300 shadow-sm'
                  } else if (isHeld) {
                    statusText = 'Đang có người giữ'
                    symbol = '⏳'
                    stateClass = 'bg-amber-100 border-amber-300 text-amber-800 cursor-not-allowed opacity-90'
                  } else if (full || disabled) {
                    stateClass = 'bg-white border-gray-200 text-gray-300 cursor-not-allowed'
                  }

                  const isButtonDisabled = disabled || isSold || (!isAvailable && !isSelected) || full

                  return (
                    <button
                      key={seat.id}
                      type="button"
                      disabled={isButtonDisabled}
                      onClick={() => toggleSeat(seat)}
                      title={`Ghế ${seat.row}${seat.number} (${statusText})${seat.category ? ` - ${seat.category}` : ''}`}
                      aria-label={`Ghế ${seat.row}${seat.number} - ${statusText}`}
                      aria-pressed={isSelected}
                      data-seat-id={seat.id}
                      data-seat-status={seat.status}
                      className={`relative min-w-[28px] h-7 px-1 rounded flex items-center justify-center gap-0.5 text-[10px] font-medium border transition-colors select-none ${stateClass}`}
                    >
                      <span className="text-[10px] leading-none shrink-0 font-bold" aria-hidden="true">
                        {symbol}
                      </span>
                      <span className="leading-none text-[9px]">
                        {seat.number}
                      </span>
                    </button>
                  )
                })}
              </div>

              <span className="w-8 text-[11px] font-bold text-gray-400 text-left shrink-0">
                {rowName}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
