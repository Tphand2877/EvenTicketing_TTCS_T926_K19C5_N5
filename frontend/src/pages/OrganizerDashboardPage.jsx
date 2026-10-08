import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'
import { CATEGORIES, formatDateTime, formatPrice, getErrorMessage } from '../components/event/eventFormat'
import ShowtimeSalesPanel from '../components/event/ShowtimeSalesPanel'
import {
  createEvent,
  createShowtime,
  deleteEvent,
  getMyEvents,
  updateEvent,
} from '../services/eventService'

const EMPTY_EVENT = { title: '', venue: '', category: CATEGORIES[0], description: '', image_url: '', published: true }
const EMPTY_SHOWTIME = { starts_at: '', price: '', capacity: '' }

/**
 * SCRUM-80 – Organizer quản lý sự kiện & suất diễn
 * S-05 / S-07 – Nạp sơ đồ ghế, mở bán / đóng bán từng suất (ShowtimeSalesPanel)
 */
export default function OrganizerDashboardPage() {
  const [events, setEvents]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [notice, setNotice]   = useState(null)

  const [eventForm, setEventForm]       = useState(EMPTY_EVENT)
  const [savingEvent, setSavingEvent]   = useState(false)
  const [showtimeFor, setShowtimeFor]   = useState(null) // event id đang mở form suất diễn
  const [showtimeForm, setShowtimeForm] = useState(EMPTY_SHOWTIME)
  const [panelRefresh, setPanelRefresh] = useState(0) // tải lại danh sách suất sau khi thêm suất

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

  const run = async (action, successText) => {
    setError(null)
    setNotice(null)
    try {
      await action()
      setNotice(successText)
      await loadEvents()
      return true
    } catch (err) {
      setError(getErrorMessage(err))
      return false
    }
  }

  const handleCreateEvent = async (e) => {
    e.preventDefault()
    setSavingEvent(true)
    const { published, ...fields } = eventForm
    const ok = await run(
      () => createEvent({
        ...fields,
        image_url: fields.image_url.trim() || null,
        status: published ? 'published' : 'draft',
      }),
      'Đã tạo sự kiện. Hãy thêm suất diễn để buyer có thể đặt vé.'
    )
    if (ok) setEventForm(EMPTY_EVENT)
    setSavingEvent(false)
  }

  const handleCreateShowtime = async (e, eventId) => {
    e.preventDefault()
    const ok = await run(
      () => createShowtime(eventId, {
        starts_at: new Date(showtimeForm.starts_at).toISOString(),
        price: Number(showtimeForm.price),
        capacity: Number(showtimeForm.capacity),
      }),
      'Đã thêm suất diễn ở trạng thái nháp. Hãy nạp sơ đồ ghế rồi bấm “Mở bán”.'
    )
    if (ok) {
      setShowtimeForm(EMPTY_SHOWTIME)
      setShowtimeFor(null)
      setPanelRefresh((n) => n + 1)
    }
  }

  const handleToggleStatus = (event) =>
    run(
      () => updateEvent(event.id, { status: event.status === 'published' ? 'draft' : 'published' }),
      event.status === 'published' ? 'Đã chuyển sự kiện về nháp.' : 'Đã công khai sự kiện.'
    )

  const handleDelete = (event) => {
    if (!window.confirm(`Xóa sự kiện "${event.title}" và toàn bộ suất diễn?`)) return
    run(() => deleteEvent(event.id), 'Đã xóa sự kiện.')
  }

  const setField = (setter) => (e) => {
    const { name, value, type, checked } = e.target
    setter((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Quản lý sự kiện</h1>

        {error && <div className="mb-4 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}
        {notice && <div className="mb-4 rounded-xl bg-green-50 text-green-700 text-sm px-4 py-3">{notice}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Create event form */}
          <form onSubmit={handleCreateEvent} className="bg-white rounded-2xl shadow-sm p-6 space-y-4 h-fit">
            <h2 className="font-semibold text-gray-900">Tạo sự kiện mới</h2>
            <input name="title" required maxLength={255} placeholder="Tên sự kiện *"
              value={eventForm.title} onChange={setField(setEventForm)} className="input-field" />
            <input name="venue" required maxLength={255} placeholder="Địa điểm *"
              value={eventForm.venue} onChange={setField(setEventForm)} className="input-field" />
            <select name="category" value={eventForm.category} onChange={setField(setEventForm)} className="input-field">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <textarea name="description" rows={4} maxLength={5000} placeholder="Mô tả"
              value={eventForm.description} onChange={setField(setEventForm)} className="input-field" />
            <input name="image_url" type="url" placeholder="Link ảnh (https://...)"
              value={eventForm.image_url} onChange={setField(setEventForm)} className="input-field" />
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input name="published" type="checkbox" checked={eventForm.published} onChange={setField(setEventForm)} />
              Công khai ngay
            </label>
            <button type="submit" disabled={savingEvent} className="btn-primary disabled:opacity-60">
              {savingEvent ? 'Đang tạo…' : 'Tạo sự kiện'}
            </button>
          </form>

          {/* My events */}
          <div className="lg:col-span-2 space-y-4">
            {loading && <p className="text-sm text-gray-500">Đang tải…</p>}
            {!loading && events.length === 0 && (
              <p className="text-sm text-gray-500">Bạn chưa có sự kiện nào.</p>
            )}

            {events.map((event) => (
              <div key={event.id} className="bg-white rounded-2xl shadow-sm p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{event.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        event.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {event.status === 'published' ? 'Công khai' : 'Nháp'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {event.category} · {event.venue}
                    </p>
                    <p className="text-sm text-gray-500">
                      {event.showtime_count} suất diễn · Từ {formatPrice(event.min_price)} · Gần nhất: {formatDateTime(event.next_starts_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {event.status === 'published' && (
                      <Link to={`/events/${event.id}`} className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                        Xem
                      </Link>
                    )}
                    <button onClick={() => { setShowtimeFor(event.id); setShowtimeForm(EMPTY_SHOWTIME) }}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                      + Suất diễn
                    </button>
                    <button onClick={() => handleToggleStatus(event)}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                      {event.status === 'published' ? 'Chuyển về nháp' : 'Công khai'}
                    </button>
                    <button onClick={() => handleDelete(event)}
                      className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                      Xóa
                    </button>
                  </div>
                </div>

                {showtimeFor === event.id && (
                  <form onSubmit={(e) => handleCreateShowtime(e, event.id)}
                    className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <input name="starts_at" type="datetime-local" required aria-label="Thời gian bắt đầu"
                      value={showtimeForm.starts_at} onChange={setField(setShowtimeForm)} className="input-field sm:col-span-2" />
                    <input name="price" type="number" min={0} step={1000} required placeholder="Giá vé (₫)"
                      value={showtimeForm.price} onChange={setField(setShowtimeForm)} className="input-field" />
                    <input name="capacity" type="number" min={1} max={100000} required placeholder="Số chỗ"
                      value={showtimeForm.capacity} onChange={setField(setShowtimeForm)} className="input-field" />
                    <div className="sm:col-span-4 flex gap-2">
                      <button type="submit" className="px-4 py-2 rounded-lg bg-pink-600 text-white text-sm font-semibold hover:bg-pink-700">
                        Lưu suất diễn
                      </button>
                      <button type="button" onClick={() => setShowtimeFor(null)}
                        className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
                        Hủy
                      </button>
                    </div>
                  </form>
                )}

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <h4 className="text-sm font-semibold text-gray-700 mb-1">Suất diễn</h4>
                  <ShowtimeSalesPanel eventId={event.id} refreshKey={panelRefresh} onChanged={loadEvents} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
