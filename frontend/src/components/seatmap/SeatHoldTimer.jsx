import { useEffect, useRef, useState } from 'react'
import { getServerNow } from '../../services/apiClient'

// Tính theo giờ server (không tin đồng hồ máy người dùng) – SCRUM-172
const getRemainingMs = (expiresAt) => Math.max(new Date(expiresAt).getTime() - getServerNow(), 0)

/**
 * Đồng hồ đếm ngược thời hạn giữ chỗ (SCRUM-84, SCRUM-172)
 *
 * Mỗi tick tính lại từ `expiresAt` thay vì trừ dần 1 giây, vì trình duyệt
 * làm chậm setInterval khi tab bị ẩn -> trừ dần sẽ lệch so với server.
 * Thời điểm hiện tại lấy từ giờ server (getServerNow) nên chỉnh sai giờ máy
 * người dùng cũng không làm lệch đồng hồ.
 *
 * @param {{ expiresAt: string, onExpire?: () => void }} props
 */
export default function SeatHoldTimer({ expiresAt, onExpire }) {
  const [remainingMs, setRemainingMs] = useState(() => getRemainingMs(expiresAt))
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    let expired = false
    const tick = () => {
      const ms = getRemainingMs(expiresAt)
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
  }, [expiresAt])

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