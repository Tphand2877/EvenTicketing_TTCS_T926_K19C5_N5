/**
 * SCRUM-165 (T-20 / AC1): Chú giải trạng thái ghế với màu sắc và ký hiệu phân biệt rõ ràng:
 * - Trống (○)
 * - Đang chọn (✓)
 * - Đang có người giữ (⏳)
 * - Đã bán (✕)
 */
const ITEMS = [
  { label: 'Còn trống', symbol: '○', className: 'bg-emerald-50 border-emerald-400 text-emerald-700' },
  { label: 'Đang chọn', symbol: '✓', className: 'bg-pink-600 border-pink-600 text-white font-bold' },
  { label: 'Đang có người giữ', symbol: '⏳', className: 'bg-amber-100 border-amber-400 text-amber-800' },
  { label: 'Đã bán', symbol: '✕', className: 'bg-gray-200 border-gray-300 text-gray-500' },
]

export default function SeatLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 select-none py-1">
      {ITEMS.map(({ label, symbol, className }) => (
        <div key={label} className="flex items-center gap-1.5" title={`${label} (${symbol})`}>
          <span
            className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-semibold border ${className}`}
            aria-hidden="true"
          >
            {symbol}
          </span>
          <span className="font-medium">{label}</span>
          <span className="text-gray-400 text-[11px]">({symbol})</span>
        </div>
      ))}
    </div>
  )
}

