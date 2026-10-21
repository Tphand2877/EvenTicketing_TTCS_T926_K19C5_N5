import PropTypes from 'prop-types'

/**
 * S-06 / T-14 & AC5:
 * Hiển thị lưới ghế trực quan: đúng số hàng, số ghế, màu theo hạng trước khi xác nhận nạp.
 */
export default function SeatMapGridPreview({ preview }) {
  if (!preview) return null

  const {
    totalSeats,
    totalRows,
    rows,
    seatsByRow,
    categories,
    categoryCounts,
    categoryColors,
  } = preview

  return (
    <div className="space-y-6">
      {/* ── Thống kê tổng quan ────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-50 border border-gray-200/80 rounded-xl p-3.5 text-center">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">Tổng số ghế</span>
          <span className="text-2xl font-bold text-gray-900 mt-1 block">{totalSeats.toLocaleString()}</span>
        </div>
        <div className="bg-gray-50 border border-gray-200/80 rounded-xl p-3.5 text-center">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">Số hàng ghế</span>
          <span className="text-2xl font-bold text-gray-900 mt-1 block">{totalRows} hàng</span>
        </div>
        <div className="bg-gray-50 border border-gray-200/80 rounded-xl p-3.5 text-center">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">Số hạng vé</span>
          <span className="text-2xl font-bold text-gray-900 mt-1 block">{categories.length} hạng</span>
        </div>
        <div className="bg-gray-50 border border-gray-200/80 rounded-xl p-3.5 text-center">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">Trạng thái tệp</span>
          <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-100 font-semibold text-xs px-2.5 py-1 rounded-full mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Hợp lệ 100%
          </span>
        </div>
      </div>

      {/* ── Bảng chú thích hạng ghế (Legend) ──────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Bảng phân loại hạng ghế ({categories.length})
        </h4>
        <div className="flex flex-wrap gap-2.5">
          {categories.map((cat) => {
            const color = categoryColors[cat] || {}
            const count = categoryCounts[cat] || 0
            const percent = totalSeats > 0 ? Math.round((count / totalSeats) * 100) : 0
            return (
              <div
                key={cat}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50/70 text-xs text-gray-700"
              >
                <span
                  className="w-3.5 h-3.5 rounded shadow-sm border border-black/10 shrink-0"
                  style={{ backgroundColor: color.hex || '#6366f1' }}
                />
                <span className="font-semibold text-gray-900">{cat}</span>
                <span className="text-gray-500">
                  {count} ghế ({percent}%)
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Lưới ghế trực quan (Seat Grid Canvas) ───────────────────── */}
      <div className="bg-gradient-to-b from-gray-900 to-slate-900 text-white rounded-2xl p-6 shadow-inner overflow-hidden border border-gray-800">
        {/* Sân khấu (Stage) */}
        <div className="max-w-md mx-auto mb-8 text-center">
          <div className="h-2 w-full rounded-full bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 shadow-[0_0_15px_rgba(236,72,153,0.5)] mb-2" />
          <span className="text-[11px] font-bold tracking-widest uppercase text-gray-400">
            SÂN KHẤU / STAGE
          </span>
        </div>

        {/* Khung cuộn lưới ghế */}
        <div className="overflow-x-auto pb-4 max-h-[480px] overflow-y-auto pr-2 scrollbar-thin">
          <div className="inline-flex flex-col gap-2 min-w-full items-center py-2">
            {rows.map((rowLabel) => {
              const seats = seatsByRow[rowLabel] || []
              return (
                <div key={rowLabel} className="flex items-center gap-2">
                  {/* Nhãn hàng ghế bên trái */}
                  <span className="w-8 h-6 flex items-center justify-center rounded text-xs font-bold text-gray-400 bg-gray-800/80 border border-gray-700 select-none">
                    {rowLabel}
                  </span>

                  {/* Danh sách ghế trong hàng */}
                  <div className="flex items-center gap-1.5">
                    {seats.map((seat) => {
                      const color = categoryColors[seat.category] || {}
                      return (
                        <div
                          key={`${seat.row}-${seat.number}`}
                          title={`Ghế ${seat.row}${seat.number} • Hạng ${seat.category}`}
                          className="w-7 h-7 rounded text-[10px] font-semibold flex items-center justify-center text-white cursor-pointer transition-transform hover:scale-110 hover:shadow-lg hover:z-10 select-none"
                          style={{
                            backgroundColor: color.hex || '#6366f1',
                            boxShadow: `0 2px 4px ${color.hex}40`,
                          }}
                        >
                          {seat.number}
                        </div>
                      )
                    })}
                  </div>

                  {/* Nhãn hàng ghế bên phải */}
                  <span className="w-8 h-6 flex items-center justify-center rounded text-xs font-bold text-gray-400 bg-gray-800/80 border border-gray-700 select-none">
                    {rowLabel}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">
          💡 Rê chuột vào từng ghế để xem thông tin chi tiết hàng, số ghế và hạng vé.
        </p>
      </div>
    </div>
  )
}

SeatMapGridPreview.propTypes = {
  preview: PropTypes.shape({
    totalSeats: PropTypes.number.isRequired,
    totalRows: PropTypes.number.isRequired,
    rows: PropTypes.arrayOf(PropTypes.string).isRequired,
    seatsByRow: PropTypes.objectOf(PropTypes.array).isRequired,
    maxSeatsInRow: PropTypes.number.isRequired,
    categories: PropTypes.arrayOf(PropTypes.string).isRequired,
    categoryCounts: PropTypes.objectOf(PropTypes.number).isRequired,
    categoryColors: PropTypes.objectOf(PropTypes.any).isRequired,
  }),
}
