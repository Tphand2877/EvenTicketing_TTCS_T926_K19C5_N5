const ITEMS = [
  { symbol: '○', label: 'Còn trống', className: 'bg-white border-gray-300 text-gray-600' },
  { symbol: 'H', label: 'Đang có người giữ', className: 'bg-amber-100 border-amber-500 text-amber-800' },
  { symbol: '×', label: 'Đã bán', className: 'bg-gray-300 border-gray-400 text-gray-700' },
  { symbol: '✓', label: 'Bạn đang giữ', className: 'bg-pink-600 border-pink-700 text-white' },
]

/** Seat state is shown with both color and a symbol. */
export default function SeatLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600">
      {ITEMS.map(({ symbol, label, className }) => (
        <div key={label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded border text-[10px] font-bold ${className}`}>
            {symbol}
          </span>
          {label}
        </div>
      ))}
    </div>
  )
}
