import { SEATS_PER_ROW, rowLabel } from './seatUtils'

/**
 * Sơ đồ chỗ ngồi (E-04)
 *
 * Backend hiện giữ chỗ theo SỐ LƯỢNG (SCRUM-84), chưa lưu từng ghế cụ thể,
 * nên sơ đồ này mang tính minh họa: `takenCount` ghế đầu tiên được hiển thị là đã có người giữ,
 * số ghế buyer chọn chính là số lượng vé gửi lên API.
 *
 * @param {{ capacity: number, takenCount: number, selected: number[], maxSelect: number,
 *           onChange: (seats: number[]) => void, disabled?: boolean }} props
 */
export default function SeatMapCanvas({ capacity, takenCount, selected, maxSelect, onChange, disabled = false }) {
  const rows = Math.ceil(capacity / SEATS_PER_ROW)

  const toggle = (seat) => {
    if (selected.includes(seat)) {
      onChange(selected.filter((s) => s !== seat))
    } else if (selected.length < maxSelect) {
      onChange([...selected, seat].sort((a, b) => a - b))
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-center text-[10px] font-semibold tracking-widest text-gray-400 uppercase">
        <div className="mx-auto mb-1 h-1.5 w-2/3 rounded-full bg-gradient-to-r from-violet-400 to-pink-400" />
        Sân khấu
      </div>

      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1.5 min-w-full items-center">
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} className="flex items-center gap-1.5">
              <span className="w-5 text-[10px] font-medium text-gray-400 text-right">{rowLabel(r)}</span>
              {Array.from({ length: SEATS_PER_ROW }, (_, c) => {
                const seat = r * SEATS_PER_ROW + c
                if (seat >= capacity) return <span key={c} className="w-6 h-6" />
                const taken = seat < takenCount
                const isSelected = selected.includes(seat)
                const full = !isSelected && selected.length >= maxSelect
                return (
                  <button
                    key={c}
                    type="button"
                    disabled={disabled || taken}
                    onClick={() => toggle(seat)}
                    title={`${rowLabel(r)}${c + 1}`}
                    aria-label={`Ghế ${rowLabel(r)}${c + 1}${taken ? ' (đã có người giữ)' : ''}`}
                    aria-pressed={isSelected}
                    className={`w-6 h-6 rounded text-[9px] font-medium border transition-colors ${
                      taken
                        ? 'bg-gray-300 border-gray-300 text-gray-400 cursor-not-allowed'
                        : isSelected
                          ? 'bg-pink-600 border-pink-600 text-white'
                          : full || disabled
                            ? 'bg-white border-gray-200 text-gray-300 cursor-not-allowed'
                            : 'bg-white border-gray-300 text-gray-500 hover:border-pink-500 hover:text-pink-600'
                    }`}
                  >
                    {c + 1}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
