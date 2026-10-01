import { formatDateTime, formatPrice } from './eventFormat'

/**
 * Danh sách suất diễn có thể chọn (SCRUM-80)
 * Suất đã bắt đầu được hiển thị nhưng không cho chọn.
 */
export default function ShowtimeList({ showtimes, selectedId, onSelect, disabled = false }) {
  if (showtimes.length === 0) {
    return <p className="text-sm text-gray-500">Sự kiện chưa có suất diễn nào.</p>
  }

  const now = Date.now()

  return (
    <div className="space-y-3">
      {showtimes.map((showtime) => {
        const isPast = new Date(showtime.starts_at).getTime() <= now
        const isDisabled = disabled || isPast
        const isSelected = selectedId === showtime.id
        return (
          <label
            key={showtime.id}
            className={`flex items-center justify-between p-3 border rounded-xl transition-all ${
              isSelected
                ? `border-pink-500 bg-pink-50/50 ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`
                : isDisabled
                  ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                  : 'border-gray-200 hover:border-pink-400 hover:bg-pink-50/50 cursor-pointer'
            }`}
          >
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="showtime"
                className="text-pink-600"
                checked={isSelected}
                disabled={isDisabled}
                onChange={() => onSelect(showtime.id)}
              />
              <span className="text-sm font-medium text-gray-700">
                {formatDateTime(showtime.starts_at)}
                {isPast && <span className="ml-2 text-xs text-gray-400">(đã diễn ra)</span>}
              </span>
            </div>
            <span className="text-sm font-bold text-gray-900">{formatPrice(showtime.price)}</span>
          </label>
        )
      })}
    </div>
  )
}
