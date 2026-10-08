const SEAT_SIZE = 30
const SEAT_GAP = 7
const ROW_GAP = 12
const LEFT_MARGIN = 48
const TOP_MARGIN = 52

const statusLabel = (seat, selected) => {
  if (selected) return 'đang được bạn giữ'
  if (seat.status === 'held') return 'đang có người giữ'
  if (seat.status === 'sold') return 'đã bán'
  return 'còn trống'
}

const statusClass = (seat, selected) => {
  if (selected) return 'fill-pink-600 stroke-pink-700'
  if (seat.status === 'held') return 'fill-amber-100 stroke-amber-500'
  if (seat.status === 'sold') return 'fill-gray-300 stroke-gray-400'
  return 'fill-white stroke-gray-400'
}

/** A single SVG keeps the map compact while retaining keyboard access. */
export default function SeatMapCanvas({ seats, selectedSeatIds = [], onSeatToggle, disabled = false }) {
  if (!Array.isArray(seats) || seats.length === 0) {
    return <p className="text-sm text-gray-500">Suất diễn chưa có sơ đồ ghế.</p>
  }

  const sortedSeats = [...seats].sort((a, b) => (
    String(a.row).localeCompare(String(b.row), undefined, { numeric: true })
    || Number(a.number) - Number(b.number)
    || Number(a.id) - Number(b.id)
  ))
  const rows = [...new Set(sortedSeats.map((seat) => String(seat.row))) ]
  const maxNumber = Math.max(...sortedSeats.map((seat) => Number(seat.number) || 0))
  const width = LEFT_MARGIN + maxNumber * (SEAT_SIZE + SEAT_GAP) + 12
  const height = TOP_MARGIN + rows.length * (SEAT_SIZE + ROW_GAP) + 12
  const selected = new Set(selectedSeatIds.map(Number))

  return (
    <div className="max-h-[60vh] overflow-auto rounded-xl border border-gray-100 bg-gray-50 p-3">
      <svg
        role="group"
        aria-label="Sơ đồ ghế của suất diễn"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="block"
      >
        <text x={width / 2} y="24" textAnchor="middle" className="fill-gray-500 text-[11px] font-semibold tracking-[0.2em]">
          SÂN KHẤU
        </text>
        <path d={`M ${LEFT_MARGIN} 32 Q ${width / 2} 48 ${width - 12} 32`} fill="none" stroke="#c4b5fd" strokeWidth="4" strokeLinecap="round" />
        {sortedSeats.map((seat) => {
          const rowIndex = rows.indexOf(String(seat.row))
          const number = Number(seat.number)
          const x = LEFT_MARGIN + (number - 1) * (SEAT_SIZE + SEAT_GAP)
          const y = TOP_MARGIN + rowIndex * (SEAT_SIZE + ROW_GAP)
          const isSelected = selected.has(Number(seat.id))
          const canSelect = seat.status === 'available' || isSelected
          const label = `Ghế ${seat.row}${seat.number}, ${statusLabel(seat, isSelected)}`
          const handleActivate = () => {
            if (!disabled && canSelect) onSeatToggle?.(seat)
          }

          return (
            <g
              key={seat.id}
              role="button"
              tabIndex={!disabled && canSelect ? 0 : -1}
              aria-label={label}
              aria-pressed={isSelected}
              aria-disabled={disabled || !canSelect}
              className={`${statusClass(seat, isSelected)} ${!disabled && canSelect ? 'cursor-pointer' : 'cursor-not-allowed'}`}
              onClick={handleActivate}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleActivate()
                }
              }}
            >
              <title>{label}</title>
              <rect
                x={x}
                y={y}
                width={SEAT_SIZE}
                height={SEAT_SIZE}
                rx="7"
                className={statusClass(seat, isSelected)}
                strokeWidth="1.5"
              />
              <text x={x + SEAT_SIZE / 2} y={y + 19} textAnchor="middle" className={`fill-current text-[10px] font-semibold ${isSelected ? 'text-white' : 'text-gray-700'}`}>
                {seat.number}
              </text>
              <text x={x + SEAT_SIZE - 4} y={y + 8} textAnchor="end" className={`fill-current text-[9px] font-bold ${isSelected ? 'text-white' : 'text-gray-700'}`}>
                {isSelected ? '✓' : seat.status === 'held' ? 'H' : seat.status === 'sold' ? '×' : '○'}
              </text>
            </g>
          )
        })}
        {rows.map((row, index) => (
          <text
            key={row}
            x="34"
            y={TOP_MARGIN + index * (SEAT_SIZE + ROW_GAP) + 19}
            textAnchor="middle"
            className="fill-gray-500 text-xs font-semibold"
          >
            {row}
          </text>
        ))}
      </svg>
    </div>
  )
}
