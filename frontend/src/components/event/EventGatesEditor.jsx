import { useEffect, useState } from 'react'
import { getEventGates, saveEventGates } from '../../services/scannerService'
import { getErrorMessage } from './eventFormat'

/** S-29: organizer khai báo các cổng soát vé của sự kiện (mỗi dòng một cổng). */
export default function EventGatesEditor({ eventId }) {
  const [gates, setGates] = useState([])
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    getEventGates(eventId).then(setGates).catch(() => setGates([]))
  }, [eventId])

  const save = async () => {
    setMessage('')
    try {
      const names = draft.split(/[\n,]/).map((g) => g.trim()).filter(Boolean)
      setGates(await saveEventGates(eventId, names))
      setEditing(false)
      setMessage('Đã lưu cổng soát vé.')
    } catch (err) {
      setMessage(getErrorMessage(err, 'Không lưu được danh sách cổng.'))
    }
  }

  return (
    <div className="mt-3 text-sm">
      <span className="font-semibold text-gray-700">Cổng soát vé: </span>
      {!editing && (
        <>
          <span className="text-gray-600">{gates.join(', ') || '—'}</span>
          <button type="button" onClick={() => { setDraft(gates.join('\n')); setEditing(true) }}
            className="ml-2 text-pink-600 hover:underline">Sửa</button>
        </>
      )}
      {editing && (
        <div className="mt-2 flex flex-wrap items-start gap-2">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} aria-label="Danh sách cổng"
            placeholder={'Mỗi dòng một cổng, VD:\nCổng A\nCổng B'} className="input-field max-w-xs" />
          <button type="button" onClick={save} className="px-3 py-1.5 rounded-lg bg-pink-600 text-white font-semibold">Lưu</button>
          <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100">Hủy</button>
        </div>
      )}
      {message && <p className="mt-1 text-gray-500">{message}</p>}
    </div>
  )
}
