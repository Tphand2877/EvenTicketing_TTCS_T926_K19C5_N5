import { useEffect, useRef, useState } from 'react'
import { decodeFromCanvas } from './qrDecode'

/**
 * S-30: đọc QR bằng camera sau của điện thoại. Mỗi mã đọc được gọi onCode(text).
 * Camera chỉ mở được trên HTTPS hoặc localhost; nếu không, màn quét vẫn dùng được ô nhập tay / ảnh.
 */
export default function QrCamera({ onCode, paused }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [active, setActive] = useState(false)
  const [error, setError] = useState('')
  const onCodeRef = useRef(onCode)
  const pausedRef = useRef(paused)
  onCodeRef.current = onCode
  pausedRef.current = paused

  useEffect(() => {
    if (!active) return undefined
    let stream
    let frame
    let stopped = false
    const tick = () => {
      if (stopped) return
      const video = videoRef.current
      if (video && video.readyState >= 2 && !pausedRef.current) {
        const text = decodeFromCanvas(canvasRef.current, video, video.videoWidth, video.videoHeight)
        if (text) onCodeRef.current(text)
      }
      frame = requestAnimationFrame(tick)
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((media) => {
        if (stopped) { media.getTracks().forEach((t) => t.stop()); return }
        stream = media
        videoRef.current.srcObject = media
        return videoRef.current.play().then(() => { frame = requestAnimationFrame(tick) })
      })
      .catch(() => {
        setError('Không mở được camera (cần HTTPS và quyền camera). Dùng ô nhập mã hoặc chọn ảnh QR bên dưới.')
        setActive(false)
      })
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [active])

  const canUseCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  return (
    <div className="space-y-2">
      <div className="relative bg-gray-900 rounded-2xl overflow-hidden aspect-video flex items-center justify-center">
        <video ref={videoRef} className={`w-full h-full object-cover ${active ? '' : 'hidden'}`} muted playsInline />
        {!active && (
          <button type="button" disabled={!canUseCamera} onClick={() => { setError(''); setActive(true) }}
            className="px-5 py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 disabled:opacity-50">
            📷 Bật camera để quét
          </button>
        )}
        {active && <div className="absolute inset-8 border-4 border-white/70 rounded-2xl pointer-events-none" />}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      {active && (
        <button type="button" onClick={() => setActive(false)} className="text-sm text-gray-600 hover:underline">Tắt camera</button>
      )}
      {error && <p className="text-sm text-amber-700">{error}</p>}
    </div>
  )
}
