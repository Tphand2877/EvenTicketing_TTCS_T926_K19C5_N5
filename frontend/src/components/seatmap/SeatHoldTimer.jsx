import { useEffect, useRef, useState } from 'react'
import { getServerNow } from '../../services/apiClient'

/**
 * Tính từ deadline máy chủ và đồng hồ monotonic để tab ẩn hoặc đổi giờ thiết bị
 * không làm kéo dài lượt giữ. Offset lấy từ response S-14 khi có; nếu không,
 * dùng đồng hồ đồng bộ qua HTTP Date của main.
 *
 * @param {{ expiresAt: string, serverOffsetMs?: number, onExpire?: () => void }} props
 */
export default function SeatHoldTimer({ expiresAt, serverOffsetMs, onExpire }) {
  const [remainingMs, setRemainingMs] = useState(0)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    let expired = false
    const deadline = Date.parse(expiresAt)
    const serverNow = Number.isFinite(serverOffsetMs) ? Date.now() + serverOffsetMs : getServerNow()
    const monotonicStart = performance.now()
    const tick = () => {
      const ms = Number.isFinite(deadline)
        ? Math.max(deadline - (serverNow + performance.now() - monotonicStart), 0)
        : 0
      setRemainingMs(ms)
      if (ms === 0 && !expired) {
        expired = true
        clearInterval(timer)
        onExpireRef.current?.()
      }
    }
    const timer = setInterval(tick, 1000)
    tick()
    return () => clearInterval(timer)
  }, [expiresAt, serverOffsetMs])

  const totalSeconds = Math.ceil(remainingMs / 1000)
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  const isUrgent = totalSeconds <= 60

  return (
    <div
      role="timer"
      aria-live="polite"
      className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium ${
        isUrgent ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'
      }`}
    >
      <span>Thời gian giữ chỗ còn lại</span>
      <span className="font-mono text-lg font-bold tabular-nums">
        {minutes}:{seconds}
      </span>
    </div>
  )
}
