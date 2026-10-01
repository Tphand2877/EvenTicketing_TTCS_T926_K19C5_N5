const ITEMS = [
  { label: 'Còn trống', className: 'bg-white border-gray-300' },
  { label: 'Đang chọn', className: 'bg-pink-600 border-pink-600' },
  { label: 'Đã có người giữ', className: 'bg-gray-300 border-gray-300' },
]

/**
 * Chú giải trạng thái ghế (E-04)
 */
export default function SeatLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-gray-600">
      {ITEMS.map(({ label, className }) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className={`w-4 h-4 rounded border ${className}`} />
          {label}
        </div>
      ))}
    </div>
  )
}
