import { useCallback, useEffect, useRef, useState } from 'react'
import { closeSales, getEventShowtimes, importSeatMap, openSales } from '../../services/eventService'
import { formatDateTime, formatPrice, getErrorMessage } from './eventFormat'

const STATUS_STYLES = {
  draft:   { label: 'Nháp',        className: 'bg-gray-100 text-gray-600' },
  on_sale: { label: 'Đang bán',    className: 'bg-green-100 text-green-700' },
  closed:  { label: 'Đã đóng bán', className: 'bg-amber-100 text-amber-800' },
}

// Lỗi 400 khi nạp sơ đồ trả danh sách lỗi theo vị trí ghế: hiện tối đa 3 dòng đầu
const describeError = (err, fallback) => {
  const errors = err?.response?.data?.errors
  if (Array.isArray(errors) && errors.length > 1) {
    return errors.slice(0, 3).join(' ') + (errors.length > 3 ? ` (+${errors.length - 3} lỗi khác)` : '')
  }
  return getErrorMessage(err, fallback)
}

/**
 * S-07 / T-16 - Organizer quản lý suất diễn của một sự kiện:
 * nạp sơ đồ ghế từ tệp JSON (S-05), mở bán / đóng bán (S-07).
 */
export default function ShowtimeSalesPanel({ eventId, refreshKey, onChanged }) {
  const [showtimes, setShowtimes] = useState([])
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [busyId, setBusyId]       = useState(null)
  const [messages, setMessages]   = useState({}) // showtimeId -> { type, text }
  const fileInputs = useRef({})

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setShowtimes(await getEventShowtimes(eventId))
    } catch (err) {
      setLoadError(getErrorMessage(err, 'Không tải được danh sách suất diễn.'))
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const setMessage = (id, type, text) => setMessages((prev) => ({ ...prev, [id]: { type, text } }))

  const run = async (id, action, fallbackError) => {
    setBusyId(id)
    setMessages((prev) => ({ ...prev, [id]: null }))
    try {
      const result = await action()
      setMessage(id, 'success', result.message)
      await load()
      onChanged?.()
    } catch (err) {
      setMessage(id, 'error', describeError(err, fallbackError))
    } finally {
      setBusyId(null)
    }
  }

  const handleFile = async (id, file) => {
    if (!file) return
    let parsed
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      setMessage(id, 'error', 'Tệp không phải JSON hợp lệ.')
      return
    }
    const seats = Array.isArray(parsed) ? parsed : parsed?.seats
    await run(id, () => importSeatMap(id, seats), 'Không nạp được sơ đồ ghế.')
  }

  if (loading) return <p className="text-sm text-gray-500">Đang tải suất diễn…</p>
  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>
  if (showtimes.length === 0) {
    return <p className="text-sm text-gray-500">Chưa có suất diễn. Bấm “+ Suất diễn” để tạo.</p>
  }

  return (
    <ul className="divide-y divide-gray-100">
      {showtimes.map((s) => {
        const status = STATUS_STYLES[s.status] || STATUS_STYLES.draft
        const busy = busyId === s.id
        const message = messages[s.id]
        return (
          <li key={s.id} className="py-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{formatDateTime(s.starts_at)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
                </div>
                <p className="text-xs text-gray-500">
                  {formatPrice(s.price)} ·{' '}
                  {s.seat_count > 0
                    ? `${s.seat_count} ghế · ${s.category_count} hạng`
                    : 'Chưa có sơ đồ ghế'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-sm">
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  ref={(el) => { fileInputs.current[s.id] = el }}
                  onChange={(e) => {
                    handleFile(s.id, e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileInputs.current[s.id]?.click()}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                >
                  {s.seat_count > 0 ? 'Thay sơ đồ ghế (JSON)' : 'Nạp sơ đồ ghế (JSON)'}
                </button>
                {s.status === 'on_sale' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(s.id, () => closeSales(s.id), 'Không đóng bán được.')}
                    className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                  >
                    Đóng bán
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(s.id, () => openSales(s.id), 'Không mở bán được.')}
                    className="px-3 py-1.5 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50"
                  >
                    {s.status === 'closed' ? 'Mở bán lại' : 'Mở bán'}
                  </button>
                )}
              </div>
            </div>
            {message && (
              <p role="status" className={`text-sm ${message.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>
                {message.text}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
