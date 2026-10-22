import { useMemo, useState } from 'react'
import { SEATS_PER_ROW, rowLabel } from './seatUtils'
import { formatPrice } from '../event/eventFormat'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.2
const ZOOM_STEP = 0.15

/**
 * SCRUM-165 (T-20) & S-10 / S-15:
 * Sơ đồ ghế trên trình duyệt kèm màu và ký hiệu trạng thái:
 * - Trống: màu xanh lá/trắng, ký hiệu '○'
 * - Đang có người giữ: màu vàng hổ phách, ký hiệu '⏳'
 * - Đã bán: màu xám, ký hiệu '✕'
 * - Bạn đang giữ / Đang chọn: màu hồng tím, ký hiệu '✓'
 *
 * AC5: Hỗ trợ phóng to thu nhỏ trên điện thoại/màn hình nhỏ và bấm trúng ghế chính xác.
 * AC4: Tối ưu hóa hiển thị 2000 ghế dưới 2 giây.
 * S-15: Hiện chi tiết hạng ghế và giá vé khi trỏ chuột / hover.
 * S-10: Hỗ trợ onSeatToggle và selectedSeatIds cho API giữ chỗ từng ghế.
 */
export default function SeatMapCanvas({
  seats: rawSeats,
  capacity,
  takenCount = 0,
  selected = [],
  selectedSeatIds = [],
  maxSelect = 10,
  onChange,
  onSeatToggle,
  disabled = false,
  onRefresh,
}) {
  const [zoom, setZoom] = useState(1.0)
  const [hoveredSeat, setHoveredSeat] = useState(null)

  // Chuẩn hóa danh sách ghế: hỗ trợ cả mảng seats từ API T-19 hoặc fallback capacity
  const normalizedSeats = useMemo(() => {
    if (Array.isArray(rawSeats) && rawSeats.length > 0) {
      return rawSeats
    }

    if (Number.isInteger(capacity) && capacity > 0) {
      const generated = []
      const rows = Math.ceil(capacity / SEATS_PER_ROW)
      for (let r = 0; r < rows; r++) {
        const row = rowLabel(r)
        for (let c = 0; c < SEATS_PER_ROW; c++) {
          const index = r * SEATS_PER_ROW + c
          if (index >= capacity) break
          const isHeld = index < takenCount
          generated.push({
            id: index + 1,
            row,
            number: c + 1,
            category: 'Standard',
            status: isHeld ? 'held' : 'available',
          })
        }
      }
      return generated
    }

    return []
  }, [rawSeats, capacity, takenCount])

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

  // Tập hợp các ID hoặc seat object đang được chọn / đang giữ
  const selectedIds = useMemo(() => {
    const set = new Set()
    for (const item of selected) {
      if (typeof item === 'object' && item !== null) {
        set.add(Number(item.id))
      } else {
        set.add(Number(item))
      }
    }
    for (const id of selectedSeatIds) {
      set.add(Number(id))
    }
    return set
  }, [selected, selectedSeatIds])

  const toggleSeat = (seat) => {
    if (disabled) return

    if (onSeatToggle) {
      onSeatToggle(seat)
      return
    }

    const isSelected = selectedIds.has(Number(seat.id))
    if (!isSelected && seat.status !== 'available') return

    let newSelected

    if (isSelected) {
      // Bỏ chọn
      newSelected = selected.filter((item) => (typeof item === 'object' ? Number(item.id) !== Number(seat.id) : Number(item) !== Number(seat.id)))
    } else {
      if (selected.length >= maxSelect) return
      // Chọn thêm
      newSelected = [...selected, seat]
    }

    if (onChange) {
      onChange(newSelected)
    }
  }

  const handleZoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, parseFloat((z + ZOOM_STEP).toFixed(2))))
  const handleZoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, parseFloat((z - ZOOM_STEP).toFixed(2))))
  const handleResetZoom = () => setZoom(1.0)

  if (normalizedSeats.length === 0) {
    return <p className="text-sm text-gray-500">Suất diễn chưa có sơ đồ ghế.</p>
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

      {/* S-15 / AC1: Thanh thông tin chi tiết khi trỏ chuột vào ghế (cố định chiều cao tránh layout shift giật bảng) */}
      <div className="min-h-[42px] flex items-center">
        {hoveredSeat ? (
          <div
            role="status"
            aria-live="polite"
            className="w-full flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-gradient-to-r from-pink-50 via-purple-50 to-indigo-50 border border-pink-200 rounded-xl text-xs shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900">
                Ghế {hoveredSeat.row}{hoveredSeat.number}
              </span>
              {hoveredSeat.category && (
                <span className="bg-white border border-gray-200 px-2 py-0.5 rounded text-[11px] font-semibold text-gray-700">
                  Hạng {hoveredSeat.category}
                </span>
              )}
              <span className="text-gray-500 text-[11px]">
                &bull; {hoveredSeat.status === 'sold' ? 'Đã bán' : hoveredSeat.status === 'held' ? 'Đang có người giữ' : 'Còn trống'}
              </span>
            </div>
            <div className="font-bold text-pink-600 text-sm">
              {hoveredSeat.price !== undefined && hoveredSeat.price !== null
                ? formatPrice(hoveredSeat.price)
                : 'Chưa có giá'}
            </div>
          </div>
        ) : (
          <div className="w-full px-3.5 py-2 text-xs text-gray-400 italic bg-gray-50/50 border border-dashed border-gray-200 rounded-xl">
            Di chuột vào ghế bất kỳ để xem chi tiết hạng vé và giá ghế
          </div>
        )}
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
                  const full = !isSelected && selected.length >= maxSelect

                  let statusText = 'Còn trống'
                  let symbol = '○'
                  let stateClass = 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-500'

                  if (isSold) {
                    statusText = 'Đã bán'
                    symbol = '✕'
                    stateClass = 'bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed opacity-80'
                  } else if (isHeld) {
                    statusText = 'Đang có người giữ'
                    symbol = '⏳'
                    stateClass = 'bg-amber-100 border-amber-300 text-amber-800 cursor-not-allowed opacity-90'
                  } else if (isSelected) {
                    statusText = 'Bạn đang giữ'
                    symbol = '✓'
                    stateClass = 'bg-pink-600 border-pink-600 text-white font-bold ring-2 ring-pink-300 shadow-sm'
                  } else if ((full || disabled) && !onSeatToggle) {
                    stateClass = 'bg-white border-gray-200 text-gray-300 cursor-not-allowed'
                  }

                  const canClick = onSeatToggle ? (isAvailable || isSelected) : (isAvailable && (!full || isSelected))
                  const isButtonDisabled = disabled || !canClick

                  // S-15 / AC1: Hiện đúng giá khi trỏ vào ghế
                  const priceText = seat.price !== undefined && seat.price !== null
                    ? ` - ${formatPrice(seat.price)}`
                    : ''
                  const seatTitle = `Ghế ${seat.row}${seat.number} (${statusText})${seat.category ? ` - ${seat.category}` : ''}${priceText}`

                  return (
                    <button
                      key={seat.id}
                      type="button"
                      disabled={isButtonDisabled}
                      onClick={() => toggleSeat(seat)}
                      onMouseEnter={() => setHoveredSeat(seat)}
                      onMouseLeave={() => setHoveredSeat((curr) => (curr?.id === seat.id ? null : curr))}
                      title={seatTitle}
                      aria-label={`Ghế ${seat.row}${seat.number} - ${statusText}${priceText}`}
                      aria-pressed={isSelected}
                      data-seat-id={seat.id}
                      data-seat-status={seat.status}
                      data-seat-price={seat.price}
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
