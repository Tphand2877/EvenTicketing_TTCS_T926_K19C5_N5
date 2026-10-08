import { useEffect, useRef, useState } from 'react'

const getRemainingMs = (expiresAt, serverOffsetMs = 0) => {
  const deadline = Date.parse(expiresAt)
  if (!Number.isFinite(deadline)) return 0
  return Math.max(deadline - (Date.now() + serverOffsetMs), 0)
}

/**
 * Đồng hồ giữ chỗ theo thời điểm hết hạn từ máy chủ (SCRUM-172 / T-24).
 *
 * Mỗi tick tính lại từ deadline và độ lệch đồng hồ đo khi tải sơ đồ. Không
 * đếm lùi theo số tick, nên tab bị ẩn hoặc đồng hồ máy khách lệch không làm sai.
 *
 * @param {{ expiresAt: string, serverOffsetMs?: number, onExpire?: () => void }} props
 */
export default function SeatHoldTimer({ expiresAt, serverOffsetMs = 0, onExpire }) {
  const [remainingMs, setRemainingMs] = useState(() => getRemainingMs(expiresAt, serverOffsetMs))
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    let expired = false
    const tick = () => {
      const ms = getRemainingMs(expiresAt, serverOffsetMs)
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
