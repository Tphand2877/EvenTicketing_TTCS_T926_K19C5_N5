import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'
import { formatDateTime, formatPrice, getErrorMessage } from '../components/event/eventFormat'
import { deleteEvent, getMyEvents, updateEvent } from '../services/eventService'

const STATUS_FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'published', label: 'Công khai' },
  { value: 'draft', label: 'Nháp' },
]

function StatCard({ label, value, accent }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${accent}`}>{value}</div>
    </div>
  )
}

/**
 * Admin quản lý toàn bộ sự kiện của mọi organizer.
 * Dùng API SCRUM-80: GET /api/events/mine trả về tất cả event khi role = admin.
 */
export default function AdminDashboardPage() {
  const [events, setEvents]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [notice, setNotice]   = useState(null)
  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState('all')

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setEvents(await getMyEvents())
    } catch (err) {
      setError(getErrorMessage(err, 'Không tải được danh sách sự kiện.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  const stats = useMemo(() => ({
    total: events.length,
    published: events.filter((e) => e.status === 'published').length,
    draft: events.filter((e) => e.status === 'draft').length,
    showtimes: events.reduce((sum, e) => sum + e.showtime_count, 0),
  }), [events])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return events.filter((e) =>
      (status === 'all' || e.status === status) &&
      (!q || e.title.toLowerCase().includes(q) || (e.organizer_name || '').toLowerCase().includes(q))
    )
  }, [events, search, status])

  const run = async (action, successText) => {
    setError(null)
    setNotice(null)
    try {
      await action()
      setNotice(successText)
      await loadEvents()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const handleToggle = (event) =>
    run(
      () => updateEvent(event.id, { status: event.status === 'published' ? 'draft' : 'published' }),
      event.status === 'published' ? `Đã ẩn "${event.title}".` : `Đã công khai "${event.title}".`
    )

  const handleDelete = (event) => {
    if (!window.confirm(`Xóa sự kiện "${event.title}" của ${event.organizer_name || 'organizer'}?`)) return
    run(() => deleteEvent(event.id), `Đã xóa "${event.title}".`)
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Quản trị hệ thống</h1>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Tổng sự kiện" value={stats.total} accent="text-gray-900" />
          <StatCard label="Đang công khai" value={stats.published} accent="text-green-600" />
          <StatCard label="Bản nháp" value={stats.draft} accent="text-gray-500" />
          <StatCard label="Suất diễn" value={stats.showtimes} accent="text-pink-600" />
        </div>

        {error && <div className="mb-4 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}
        {notice && <div className="mb-4 rounded-xl bg-green-50 text-green-700 text-sm px-4 py-3">{notice}</div>}

        <div className="bg-white rounded-2xl shadow-sm">
          <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-100">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên sự kiện hoặc organizer…"
              className="input-field max-w-sm"
            />
            <div className="flex gap-2">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStatus(f.value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                    status === f.value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-medium">Sự kiện</th>
                  <th className="px-4 py-3 font-medium">Organizer</th>
                  <th className="px-4 py-3 font-medium">Trạng thái</th>
                  <th className="px-4 py-3 font-medium">Suất diễn</th>
                  <th className="px-4 py-3 font-medium">Giá từ</th>
                  <th className="px-4 py-3 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Đang tải…</td></tr>
                )}
                {!loading && visible.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Không có sự kiện nào.</td></tr>
                )}
                {!loading && visible.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{event.title}</div>
                      <div className="text-xs text-gray-500">{event.category} · {event.venue}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{event.organizer_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        event.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {event.status === 'published' ? 'Công khai' : 'Nháp'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {event.showtime_count}
                      {event.next_starts_at && (
                        <div className="text-xs text-gray-500">Gần nhất: {formatDateTime(event.next_starts_at)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{formatPrice(event.min_price)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        {event.status === 'published' && (
                          <Link to={`/events/${event.id}`} className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                            Xem
                          </Link>
                        )}
                        <button onClick={() => handleToggle(event)} className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                          {event.status === 'published' ? 'Ẩn' : 'Công khai'}
                        </button>
                        <button onClick={() => handleDelete(event)} className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
