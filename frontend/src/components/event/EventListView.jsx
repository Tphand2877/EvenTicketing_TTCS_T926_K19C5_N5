import EventCard from './EventCard'

/**
 * Lưới sự kiện cho buyer, xử lý đủ 4 trạng thái: đang tải / lỗi / rỗng / có dữ liệu (SCRUM-80)
 */
export default function EventListView({ events, loading, error, onRetry }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-80 rounded-2xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-600 mb-4">{error}</p>
        {onRetry && (
          <button onClick={onRetry} className="text-sm font-semibold text-pink-600 hover:underline">
            Thử lại
          </button>
        )}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-3">🎫</div>
        <p className="text-gray-600">Chưa có sự kiện nào phù hợp.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  )
}
