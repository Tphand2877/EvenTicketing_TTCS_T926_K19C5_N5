import { Link } from 'react-router-dom'
import { formatDateTime, formatPrice, getCategoryStyle } from './eventFormat'

/**
 * Thẻ sự kiện trong danh sách (SCRUM-80)
 * @param {{ event: object }} props – event từ GET /api/events
 */
export default function EventCard({ event }) {
  const { color, emoji } = getCategoryStyle(event.category)

  return (
    <Link
      to={`/events/${event.id}`}
      className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl border border-gray-100 transition-all duration-300 hover:-translate-y-1"
    >
      {/* Thumbnail */}
      <div className={`h-48 bg-gradient-to-br ${color} relative flex items-center justify-center overflow-hidden`}>
        {event.image_url
          ? <img src={event.image_url} alt={event.title} className="absolute inset-0 w-full h-full object-cover" />
          : <span className="text-6xl">{emoji}</span>}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-pink-600 bg-pink-50 px-2.5 py-0.5 rounded-full">
            {event.category}
          </span>
        </div>
        <h3 className="font-bold text-gray-900 text-sm leading-snug mb-3 group-hover:text-pink-600 transition-colors line-clamp-2">
          {event.title}
        </h3>

        <div className="space-y-1.5 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {formatDateTime(event.next_starts_at)}
          </div>
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="truncate">{event.venue}</span>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <div>
            <span className="text-xs text-gray-400">Từ</span>
            <div className="font-bold text-gray-900 text-sm">{formatPrice(event.min_price)}</div>
          </div>
          <span className="text-xs font-semibold text-pink-600 bg-pink-50 px-3 py-1.5 rounded-lg group-hover:bg-pink-600 group-hover:text-white transition-colors">
            Mua vé &rarr;
          </span>
        </div>
      </div>
    </Link>
  )
}
