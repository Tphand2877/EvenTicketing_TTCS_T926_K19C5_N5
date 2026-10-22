import { useCallback, useEffect, useRef, useState } from 'react'
import Header from '../components/common/Header'
import QrCamera from '../components/scanner/QrCamera'
import { decodeFromCanvas } from '../components/scanner/qrDecode'
import { formatDateTime, getErrorMessage } from '../components/event/eventFormat'
import { useAuth } from '../context/AuthContext'
import { admitWithNote, getScannerShowtimes, scanTicket } from '../services/scannerService'

const CONTEXT_KEY = 'et_scanner_context'
const REPEAT_WINDOW_MS = 3000
// S-30: sau 3 giây chưa có trả lời thì báo "đang chờ" thay vì đứng im
const WAIT_NOTICE_MS = 3000

const timeOf = (iso) => (iso ? new Intl.DateTimeFormat('vi-VN', { timeStyle: 'medium' }).format(new Date(iso)) : '')

const readContext = () => {
  try { return JSON.parse(localStorage.getItem(CONTEXT_KEY)) || null } catch { return null }
}

const writeContext = (value) => {
  try {
    if (value) localStorage.setItem(CONTEXT_KEY, JSON.stringify(value))
    else localStorage.removeItem(CONTEXT_KEY)
  } catch { /* trình duyệt chặn lưu trữ: chỉ mất phần nhớ lựa chọn */ }
}

/** S-29: chọn suất diễn và cổng trước khi quét */
function ContextPicker({ showtimes, loading, error, initial, onStart }) {
  const [showtimeId, setShowtimeId] = useState(initial?.showtimeId ?? null)
  const [gate, setGate] = useState(initial?.gate ?? '')
  const selected = showtimes.find((s) => s.id === showtimeId)

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Chọn suất diễn</h2>
        {loading && <p className="text-gray-500">Đang tải suất diễn…</p>}
        {error && <p className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</p>}
        {!loading && !error && showtimes.length === 0 && <p className="text-gray-500">Chưa có suất diễn nào để soát vé.</p>}
        <div className="grid sm:grid-cols-2 gap-3">
          {showtimes.map((s) => (
            <button key={s.id} type="button" data-testid={`showtime-${s.id}`}
              onClick={() => { setShowtimeId(s.id); setGate(s.gates.length === 1 ? s.gates[0] : '') }}
              className={`text-left p-4 rounded-2xl border-2 transition ${s.id === showtimeId ? 'border-pink-600 bg-pink-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
              <div className="font-semibold text-gray-900">{s.event.title}</div>
              <div className="text-sm text-gray-600">{formatDateTime(s.startsAt)} · {s.event.venue}</div>
              <div className="text-xs text-gray-500 mt-1">Đã vào {s.checkedIn}/{s.tickets} vé</div>
            </button>
          ))}
        </div>
      </section>
      {selected && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Chọn cổng</h2>
          <div className="flex flex-wrap gap-2">
            {selected.gates.map((g) => (
              <button key={g} type="button" onClick={() => setGate(g)}
                className={`px-5 py-3 rounded-xl border-2 font-semibold ${g === gate ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300'}`}>
                {g}
              </button>
            ))}
          </div>
        </section>
      )}
      <button type="button" disabled={!selected || !gate} onClick={() => onStart({ showtimeId: selected.id, gate })}
        className="btn-primary !w-auto px-8 disabled:opacity-50">
        Bắt đầu soát vé
      </button>
    </div>
  )
}

const SHORT_LABEL = {
  CHECKED_IN: 'Mời vào', ADMITTED_WITH_NOTE: 'Vào có ghi chú', ALREADY_CHECKED_IN: 'Vé đã dùng',
  OVERRIDE_ALREADY_RECORDED: 'Đã ghi trước đó', INVALID_QR: 'QR không hợp lệ', TICKET_NOT_FOUND: 'Không có vé',
  TICKET_VOID: 'Vé đã huỷ', WRONG_SHOWTIME: 'Sai suất',
}

const TONE = {
  CHECKED_IN: 'bg-green-600', ADMITTED_WITH_NOTE: 'bg-green-600',
  ALREADY_CHECKED_IN: 'bg-red-600', OVERRIDE_ALREADY_RECORDED: 'bg-amber-500',
}

/** Kết quả lần quét gần nhất: xanh = mời vào, đỏ = không cho vào */
function ScanResult({ result, canOverride, onOverride }) {
  const [reason, setReason] = useState('')
  const [requestId, setRequestId] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const tone = TONE[result.code] || (result.accepted ? 'bg-green-600' : 'bg-red-600')

  const confirm = async () => {
    setError('')
    // Một lần xác nhận = một requestId; gửi lại sau lỗi mạng dùng lại đúng id đó (S-31)
    const id = requestId || crypto.randomUUID()
    setRequestId(id)
    setSending(true)
    try {
      await onOverride({ reason: reason.trim(), requestId: id })
    } catch (err) {
      setError(getErrorMessage(err, 'Không ghi nhận được. Thử lại.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div data-testid="scan-result" data-code={result.code} className={`rounded-2xl text-white p-5 ${tone}`}>
      <div className="text-2xl font-bold">{result.accepted ? '✓ ' : '✕ '}{result.message}</div>
      {result.ticket && (
        <div className="mt-2 text-white/90 space-y-0.5">
          <div>Ghế <strong>{result.ticket.seat}</strong> · {result.ticket.category} · Mã vé {result.ticket.code}</div>
          <div className="text-sm">{result.ticket.event.title} · {formatDateTime(result.ticket.showtime.startsAt)}</div>
        </div>
      )}
      {result.firstAdmission && (
        <div className="mt-3 p-3 rounded-xl bg-black/20 text-sm">
          Đã vào lúc <strong>{timeOf(result.firstAdmission.checkedInAt)}</strong> ({formatDateTime(result.firstAdmission.checkedInAt)})
          tại <strong>{result.firstAdmission.gate}</strong>, nhân viên {result.firstAdmission.staffName}.
        </div>
      )}
      {result.code === 'ALREADY_CHECKED_IN' && canOverride && (
        <div className="mt-4 space-y-2">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2}
            placeholder="Lý do cho vào (bắt buộc), VD: khách ra ngoài lấy đồ, đã kiểm tra CCCD"
            className="w-full rounded-xl p-3 text-gray-900" aria-label="Lý do cho vào" />
          <button type="button" disabled={!reason.trim() || sending} onClick={confirm}
            className="px-4 py-2 rounded-xl bg-white text-red-700 font-semibold disabled:opacity-60">
            {sending ? 'Đang ghi…' : 'Cho vào có ghi chú'}
          </button>
          {error && <p className="text-sm">{error}</p>}
        </div>
      )}
    </div>
  )
}

/** S-29 / S-30 / S-31: màn soát vé tại cổng */
export default function ScannerPage() {
  const { user } = useAuth()
  const canOverride = ['supervisor', 'admin'].includes(user?.role)
  const [showtimes, setShowtimes] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [context, setContext] = useState(readContext)
  const [manual, setManual] = useState('')
  const [busy, setBusy] = useState(false)
  const [slow, setSlow] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const lastCode = useRef({ text: '', at: 0 })
  const lastScanned = useRef('')
  const imageCanvas = useRef(null)

  const loadShowtimes = useCallback(() => {
    setLoading(true)
    getScannerShowtimes()
      .then((list) => { setShowtimes(list); setLoadError('') })
      .catch((err) => setLoadError(getErrorMessage(err, 'Không tải được suất diễn.')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(loadShowtimes, [loadShowtimes])

  const current = context && showtimes.find((s) => s.id === context.showtimeId)

  // Lựa chọn đã nhớ không còn hợp lệ (suất bị ẩn, cổng bị đổi) -> chọn lại
  useEffect(() => {
    if (!loading && context && (!current || !current.gates.includes(context.gate))) {
      setContext(null)
      writeContext(null)
    }
  }, [loading, context, current])

  const record = (text, scanResult) => {
    setResult(scanResult)
    setHistory((prev) => [{ at: new Date().toISOString(), code: scanResult.code, accepted: scanResult.accepted, seat: scanResult.ticket?.seat, text }, ...prev].slice(0, 10))
    if (!scanResult.accepted) navigator.vibrate?.(300)
  }

  const submit = async (raw) => {
    const text = raw.trim()
    if (!text || busy || !context) return
    // Camera đọc cùng một mã nhiều lần mỗi giây: bỏ qua mã vừa quét trong 3 giây
    const now = Date.now()
    if (lastCode.current.text === text && now - lastCode.current.at < REPEAT_WINDOW_MS) return
    lastCode.current = { text, at: now }
    setBusy(true)
    setSlow(false)
    setError('')
    // S-30: quá 3 giây chưa có trả lời thì hiện trạng thái "đang chờ"
    const slowTimer = setTimeout(() => setSlow(true), WAIT_NOTICE_MS)
    try {
      lastScanned.current = text
      record(text, await scanTicket({ qrCode: text, ...context }))
    } catch (err) {
      setResult(null)
      setError(getErrorMessage(err, 'Không kiểm tra được vé. Kiểm tra kết nối rồi quét lại.'))
    } finally {
      clearTimeout(slowTimer)
      setSlow(false)
      setBusy(false)
    }
  }

  const handleOverride = async ({ reason, requestId }) => {
    const text = lastScanned.current
    record(text, await admitWithNote({ qrCode: text, ...context, reason, requestId }))
  }

  const handleImage = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const img = new Image()
    img.onload = () => {
      const text = decodeFromCanvas(imageCanvas.current, img, img.naturalWidth, img.naturalHeight)
      URL.revokeObjectURL(img.src)
      if (text) submit(text)
      else setError('Không đọc được mã QR trong ảnh.')
    }
    img.src = URL.createObjectURL(file)
  }

  const start = (value) => {
    setContext(value)
    writeContext(value)
    setResult(null)
    setHistory([])
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 space-y-5">
        <h1 className="text-2xl font-bold text-gray-900">Soát vé</h1>
        {!current && (
          <ContextPicker showtimes={showtimes} loading={loading} error={loadError} initial={context} onStart={start} />
        )}
        {current && (
          <>
            <div data-testid="scan-context" className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-gray-900 text-white">
              <div>
                <div className="font-semibold">{current.event.title}</div>
                <div className="text-sm text-white/80">{formatDateTime(current.startsAt)} · <strong>{context.gate}</strong></div>
              </div>
              <button type="button" onClick={() => { setContext(null); writeContext(null); loadShowtimes() }}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm">Đổi suất / cổng</button>
            </div>
            <QrCamera onCode={submit} paused={busy} />
            <form onSubmit={(e) => { e.preventDefault(); submit(manual); setManual('') }} className="flex gap-2">
              <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Hoặc nhập / dùng máy quét cầm tay để nhập mã QR"
                className="input-field flex-1" aria-label="Mã QR" autoComplete="off" />
              <button type="submit" disabled={busy || !manual.trim()} className="px-4 rounded-xl bg-pink-600 text-white font-semibold disabled:opacity-50">Kiểm tra</button>
            </form>
            <label className="inline-block text-sm text-pink-600 hover:underline cursor-pointer">
              Chọn ảnh có mã QR
              <input type="file" accept="image/*" capture="environment" onChange={handleImage} className="hidden" data-testid="qr-image" />
            </label>
            <canvas ref={imageCanvas} className="hidden" />
            {busy && !slow && <p className="text-gray-500">Đang kiểm tra vé…</p>}
            {busy && slow && (
              <div data-testid="scan-waiting" className="rounded-2xl bg-amber-500 text-white p-5 text-2xl font-bold">
                Đang chờ máy chủ phản hồi… Chưa cho khách vào.
              </div>
            )}
            {error && <p className="p-3 rounded-xl bg-red-50 text-red-700">{error}</p>}
            {result && <ScanResult key={`${result.code}-${history.length}`} result={result} canOverride={canOverride} onOverride={handleOverride} />}
            {history.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Lượt quét gần đây</h2>
                <ul className="divide-y divide-gray-100 bg-white rounded-2xl shadow-sm text-sm">
                  {history.map((h, i) => (
                    <li key={`${h.at}-${i}`} className="px-4 py-2 flex justify-between">
                      <span>{timeOf(h.at)} · {h.seat ? `Ghế ${h.seat}` : 'Không rõ vé'}</span>
                      <span className={h.accepted ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>{SHORT_LABEL[h.code] || h.code}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
