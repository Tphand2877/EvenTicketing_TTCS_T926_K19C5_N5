import { useState, useEffect, useRef } from 'react'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'
import { verifyTicket, getRecentScans, getTodayShowtimes } from '../services/adminService'

export default function TicketScannerPage() {
  const [ticketCode, setTicketCode] = useState('')
  const [scanning, setScanning] = useState(false)
  const [activeCamera, setActiveCamera] = useState(false) // AC1: Khóa camera cho đến khi chọn đủ suất & cửa
  const [lastResult, setLastResult] = useState(null)
  const [scansList, setScansList] = useState([])
  const [stats, setStats] = useState({ total: 0, valid: 0, duplicate: 0, invalid: 0 })
  const [errorMsg, setErrorMsg] = useState(null)
  const inputRef = useRef(null)

  // ── S-29 States: Quản lý Suất diễn hôm nay & Cổng soát vé ─────────────────
  const [todayShowtimes, setTodayShowtimes] = useState([])
  const [loadingShowtimes, setLoadingShowtimes] = useState(true)
  const [selectedShowtime, setSelectedShowtime] = useState(null)
  const [selectedGate, setSelectedGate] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)

  // State tạm trong modal khi chọn
  const [tempShowtimeId, setTempShowtimeId] = useState('')
  const [tempGate, setTempGate] = useState('')
  const [customGate, setCustomGate] = useState('')
  const [isCustomGate, setIsCustomGate] = useState(false)

  // Tải danh sách các lượt quét gần nhất
  const fetchRecent = async () => {
    try {
      const res = await getRecentScans()
      if (res?.recentScans) {
        setScansList(res.recentScans)
        const validCount = res.recentScans.filter((s) => s.status === 'VALID').length
        const dupCount = res.recentScans.filter((s) => s.status === 'ALREADY_CHECKED_IN').length
        const invCount = res.recentScans.filter((s) => s.status === 'INVALID').length
        setStats({
          total: res.recentScans.length,
          valid: validCount,
          duplicate: dupCount,
          invalid: invCount,
        })
      }
    } catch {
      // Khi offline / chưa có log
    }
  }

  // Tải danh sách suất diễn hôm nay (S-29 AC1 & AC3)
  const fetchShowtimes = async (params = {}) => {
    setLoadingShowtimes(true)
    try {
      const res = await getTodayShowtimes(params)
      const list = res?.showtimes || []
      setTodayShowtimes(list)

      // Kiểm tra cấu hình đã lưu trong localStorage (S-29 NFR)
      const savedShowtimeStr = localStorage.getItem('scanner_selected_showtime')
      const savedGate = localStorage.getItem('scanner_selected_gate')

      if (savedShowtimeStr && savedGate) {
        try {
          const parsed = JSON.parse(savedShowtimeStr)
          // Xác thực xem suất đã lưu có còn hợp lệ trong danh sách hôm nay không
          const matching = list.find((s) => s.id === parsed.id)
          if (matching) {
            setSelectedShowtime(matching)
            setSelectedGate(savedGate)
            setActiveCamera(true) // Đã có cấu hình hợp lệ -> kích hoạt camera
            return
          }
        } catch {
          // Bỏ qua lỗi parse
        }
      }

      // Chưa có cấu hình hoặc cấu hình cũ không còn hôm nay:
      if (list.length > 0) {
        // Có suất hôm nay nhưng chưa chọn -> Mở modal chọn (AC1)
        setIsModalOpen(true)
        setActiveCamera(false)
        setTempShowtimeId(list[0].id.toString())
        setTempGate(list[0].gates?.[0] || 'Cổng chính')
      } else {
        // AC3: Không có suất nào hôm nay
        setSelectedShowtime(null)
        setSelectedGate('')
        setActiveCamera(false)
        setIsModalOpen(false)
      }
    } catch (err) {
      console.error('[TicketScanner] Lỗi nạp suất diễn:', err)
    } finally {
      setLoadingShowtimes(false)
    }
  }

  useEffect(() => {
    fetchRecent()
    fetchShowtimes()
  }, [])

  // Xử lý mở Modal đổi cửa/suất diễn (S-29 AC2)
  const handleOpenModal = () => {
    if (selectedShowtime) {
      setTempShowtimeId(selectedShowtime.id.toString())
      setTempGate(selectedGate)
      setIsCustomGate(!selectedShowtime.gates?.includes(selectedGate))
      if (!selectedShowtime.gates?.includes(selectedGate)) {
        setCustomGate(selectedGate)
      }
    } else if (todayShowtimes.length > 0) {
      setTempShowtimeId(todayShowtimes[0].id.toString())
      setTempGate(todayShowtimes[0].gates?.[0] || 'Cổng chính')
      setIsCustomGate(false)
    }
    setIsModalOpen(true)
  }

  // Xác nhận lưu lựa chọn suất diễn và cửa (S-29 AC1, AC2 & NFR)
  const handleSaveSelection = () => {
    const showtime = todayShowtimes.find((s) => s.id === Number(tempShowtimeId))
    const gateName = (isCustomGate ? customGate : tempGate).trim()

    if (!showtime || !gateName) return

    setSelectedShowtime(showtime)
    setSelectedGate(gateName)

    // Lưu vào localStorage (NFR)
    localStorage.setItem('scanner_selected_showtime', JSON.stringify(showtime))
    localStorage.setItem('scanner_selected_gate', gateName)

    setIsModalOpen(false)
    setActiveCamera(true) // AC1: Chỉ bật camera sau khi đã chọn đủ
    inputRef.current?.focus()
  }

  // Xử lý xác thực vé kèm theo Suất diễn và Cửa vào (S-29 AC2)
  const handleVerify = async (codeToVerify) => {
    const code = (codeToVerify || ticketCode).trim()
    if (!code) return

    // Kiểm tra tiền điều kiện: Bắt buộc phải có suất & cửa trước khi quét (AC1)
    if (!selectedShowtime || !selectedGate) {
      setIsModalOpen(true)
      return
    }

    setScanning(true)
    setErrorMsg(null)

    try {
      const res = await verifyTicket(code, {
        gate: selectedGate,
        showtimeId: selectedShowtime.id,
        eventTitle: selectedShowtime.event_title,
        venue: selectedShowtime.event_venue,
        showtimeTitle: `${new Date(selectedShowtime.starts_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${selectedShowtime.event_title}`,
      })
      setLastResult(res?.data || { status: res.status, message: res.message })
      setTicketCode('')
      await fetchRecent()
    } catch (err) {
      const errData = err.response?.data
      if (errData?.data) {
        setLastResult(errData.data)
      } else {
        setErrorMsg(errData?.message || 'Lỗi kết nối máy chủ xác thực vé.')
      }
    } finally {
      setScanning(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleVerify()
    }
  }

  // Lấy danh sách cổng của suất đang được chọn trong modal
  const currentModalShowtime = todayShowtimes.find((s) => s.id === Number(tempShowtimeId))
  const availableGates = currentModalShowtime?.gates || ['Cổng chính', 'Cổng A', 'Cổng B', 'Cổng VIP']

  return (
    <div className="min-h-screen flex flex-col bg-slate-900 text-slate-100">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-800">
          <div>
            {/* S-29 AC1/AC2: Badge hiển thị vị trí cổng và suất diễn hiện tại */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {selectedShowtime && selectedGate ? (
                <>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    CỬA SOÁT: {selectedGate.toUpperCase()}
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                    <span>🎭 {selectedShowtime.event_title}</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-emerald-400 font-semibold">
                      {new Date(selectedShowtime.starts_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <button
                    onClick={handleOpenModal}
                    className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 bg-sky-950/40 hover:bg-sky-900/50 border border-sky-800/50 px-2.5 py-1 rounded-full transition-all"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    Đổi cửa / suất diễn
                  </button>
                </>
              ) : (
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  CHƯA CHỌN CỬA VÀ SUẤT DIỄN
                </div>
              )}
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              Màn hình Quét Vé & Check-in
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Khai báo cửa vào, xác thực mã QR vé và ngăn chặn vé quét trùng lặp tại cửa.
            </p>
          </div>

          {/* Quick Stats Badges */}
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3 text-center min-w-[75px]">
              <div className="text-xs text-slate-400">Đã quét</div>
              <div className="text-xl font-bold text-white mt-0.5">{stats.total}</div>
            </div>
            <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-xl p-3 text-center min-w-[75px]">
              <div className="text-xs text-emerald-400">Hợp lệ</div>
              <div className="text-xl font-bold text-emerald-300 mt-0.5">{stats.valid}</div>
            </div>
            <div className="bg-amber-950/40 border border-amber-800/40 rounded-xl p-3 text-center min-w-[75px]">
              <div className="text-xs text-amber-400">Trùng lặp</div>
              <div className="text-xl font-bold text-amber-300 mt-0.5">{stats.duplicate}</div>
            </div>
            <div className="bg-rose-950/40 border border-rose-800/40 rounded-xl p-3 text-center min-w-[75px]">
              <div className="text-xs text-rose-400">Từ chối</div>
              <div className="text-xl font-bold text-rose-300 mt-0.5">{stats.invalid}</div>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white">✕</button>
          </div>
        )}

        {/* ── S-29 AC3: THÔNG BÁO KHI KHÔNG CÓ SUẤT DIỄN HÔM NAY ───────────────── */}
        {!loadingShowtimes && todayShowtimes.length === 0 ? (
          <div className="bg-slate-800/80 border border-amber-500/30 rounded-3xl p-8 sm:p-12 text-center max-w-2xl mx-auto my-8 shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Hôm nay không có suất diễn nào cần soát vé
            </h2>
            <p className="text-sm text-slate-300 max-w-md mx-auto mb-6">
              Hệ thống không tìm thấy suất diễn nào đang mở bán hoặc diễn ra trong ngày hôm nay ({new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}).
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => fetchShowtimes()}
                className="px-5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold transition-all shadow"
              >
                🔄 Kiểm tra lại
              </button>
              <button
                onClick={() => fetchShowtimes({ include_sample: 'true' })}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all shadow-lg shadow-emerald-950/50"
              >
                ⚡ Sử dụng suất diễn mẫu để thử nghiệm
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* CỘT TRÁI: Scanner Viewfinder & Input Form */}
            <div className="lg:col-span-7 space-y-6">
              {/* Viewfinder mô phỏng camera quét QR */}
              <div className="relative aspect-[4/3] sm:aspect-[16/10] bg-black rounded-3xl overflow-hidden border-2 border-slate-700 shadow-2xl flex flex-col items-center justify-center">
                {/* AC1: KHÓA CAMERA NẾU CHƯA CHỌN SUẤT DIỄN VÀ CỬA */}
                {!selectedShowtime || !selectedGate ? (
                  <div className="text-center p-8 z-10 max-w-sm">
                    <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-4 text-amber-400">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <h3 className="text-base font-bold text-white">Máy ảnh chưa được kích hoạt</h3>
                    <p className="text-xs text-slate-400 mt-1.5 mb-5">
                      Theo quy định soát vé (S-29), nhân viên phải khai báo suất diễn hôm nay và tên cửa đang đứng trước khi bật máy ảnh.
                    </p>
                    <button
                      onClick={handleOpenModal}
                      className="w-full px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-emerald-950/60 transition-all"
                    >
                      Khai báo Suất diễn & Cửa vào
                    </button>
                  </div>
                ) : activeCamera ? (
                  <>
                    {/* Scanner video background simulation */}
                    <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-black opacity-90" />

                    {/* Grid overlay */}
                    <div
                      className="absolute inset-0 opacity-15"
                      style={{
                        backgroundImage: `radial-gradient(circle, #38bdf8 1px, transparent 1px)`,
                        backgroundSize: '24px 24px',
                      }}
                    />

                    {/* Laser scan line animation */}
                    <div className="absolute inset-x-8 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_15px_#10b981] animate-bounce duration-1000" />

                    {/* Viewfinder Target Frame */}
                    <div className="relative z-10 w-64 h-64 border border-dashed border-emerald-400/50 rounded-2xl flex items-center justify-center p-4">
                      {/* 4 corner brackets */}
                      <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                      <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                      <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

                      <div className="text-center p-3 backdrop-blur-sm bg-slate-950/60 rounded-xl border border-slate-700/50">
                        <svg className="w-10 h-10 text-emerald-400 mx-auto mb-2 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                        <p className="text-xs font-semibold text-emerald-300">Đang hướng ống kính vào mã QR</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Soát vé tại: <span className="text-white font-bold">{selectedGate}</span></p>
                      </div>
                    </div>

                    {/* Top Bar Controls */}
                    <div className="absolute top-4 inset-x-4 flex items-center justify-between z-20">
                      <span className="flex items-center gap-2 text-xs font-medium text-emerald-400 bg-slate-950/80 px-3 py-1 rounded-full border border-emerald-500/30">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        CAMERA TRỰC TIẾP ({selectedGate})
                      </span>
                      <button
                        onClick={() => setActiveCamera(false)}
                        className="text-xs bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-3 py-1 rounded-full border border-slate-700"
                      >
                        Tắt Camera
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center p-8 z-10">
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-white">Camera đang tắt</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                      Đã chọn {selectedGate}. Bạn có thể bật camera để quét mã tự động hoặc nhập mã vé thủ công bên dưới.
                    </p>
                    <button
                      onClick={() => setActiveCamera(true)}
                      className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-900/50"
                    >
                      Bật Camera Quét Mã
                    </button>
                  </div>
                )}
              </div>

              {/* Input Bar cho máy quét cầm tay hoặc nhập tay */}
              <div className="bg-slate-800/70 border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="ticket-input" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Nhập hoặc quét mã vạch / Barcode / QR Code
                  </label>
                  {selectedGate && (
                    <span className="text-[11px] text-emerald-400 font-medium">
                      Điểm vào: <span className="font-bold underline">{selectedGate}</span>
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      id="ticket-input"
                      ref={inputRef}
                      type="text"
                      value={ticketCode}
                      onChange={(e) => setTicketCode(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={selectedGate ? `Đang ở ${selectedGate} - Quét mã QR hoặc nhập VD: TICK-2026-VIP-A1` : 'Vui lòng chọn cửa trước khi quét'}
                      disabled={!selectedShowtime || !selectedGate}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono disabled:opacity-50"
                      autoComplete="off"
                    />
                    {ticketCode && (
                      <button
                        onClick={() => setTicketCode('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => handleVerify()}
                    disabled={scanning || !ticketCode.trim() || !selectedShowtime || !selectedGate}
                    className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-emerald-950/60 whitespace-nowrap"
                  >
                    {scanning ? 'Đang kiểm tra…' : 'Xác thực vé'}
                  </button>
                </div>

                {/* Demo Quick Test Pills */}
                <div className="mt-4 pt-3 border-t border-slate-700/50 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-400">Kiểm thử nhanh:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const randomCode = `TICK-VIP-${Math.floor(1000 + Math.random() * 9000)}`
                      handleVerify(randomCode)
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 hover:bg-emerald-900/60 transition-colors"
                  >
                    ✓ Thử vé hợp lệ mới
                  </button>
                  <button
                    type="button"
                    onClick={() => handleVerify('TICK-VIP-DUPLICATE-SAMPLE')}
                    className="px-2.5 py-1 rounded-lg text-xs bg-amber-950/60 text-amber-300 border border-amber-800/60 hover:bg-amber-900/60 transition-colors"
                  >
                    ⚠️ Thử quét trùng lặp
                  </button>
                  <button
                    type="button"
                    onClick={() => handleVerify('FAKE-QR-CODE-TEST')}
                    className="px-2.5 py-1 rounded-lg text-xs bg-rose-950/60 text-rose-300 border border-rose-800/60 hover:bg-rose-900/60 transition-colors"
                  >
                    ✕ Thử vé giả mạo
                  </button>
                </div>
              </div>
            </div>

            {/* CỘT PHẢI: Kết quả xác thực tức thì & Lịch sử lượt quét */}
            <div className="lg:col-span-5 space-y-6">
              {/* THẺ KẾT QUẢ QUÉT GẦN NHẤT */}
              <div className="bg-slate-800/80 border border-slate-700 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center justify-between">
                  <span>Kết quả kiểm tra tức thì</span>
                  {selectedGate && (
                    <span className="text-[11px] font-semibold text-emerald-400">
                      Ghi nhận tại: {selectedGate}
                    </span>
                  )}
                </h2>

                {!lastResult ? (
                  <div className="py-12 text-center text-slate-500">
                    <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <p className="text-sm">Chưa có vé nào được quét</p>
                    <p className="text-xs text-slate-600 mt-1">Quét mã QR hoặc nhập mã vé để hiển thị kết quả tại đây</p>
                  </div>
                ) : lastResult.status === 'VALID' ? (
                  /* VÉ HỢP LỆ */
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 flex items-start gap-3 animate-fade-in">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-extrabold text-base text-emerald-200">VÉ HỢP LỆ - MỜI VÀO CỬA</div>
                        <div className="text-xs text-emerald-300/80 mt-0.5">{lastResult.message}</div>
                      </div>
                    </div>

                    <div className="bg-slate-900/90 rounded-2xl p-4 border border-slate-700/80 space-y-3 text-sm">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                        <span className="text-slate-400 text-xs">Cửa vào ghi nhận (S-29):</span>
                        <span className="font-bold text-emerald-400 text-xs px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30">
                          📍 {lastResult.gate || selectedGate}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                        <span className="text-slate-400 text-xs">Mã vé:</span>
                        <span className="font-mono font-bold text-white text-xs">{lastResult.code}</span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                        <span className="text-slate-400 text-xs">Khách tham dự:</span>
                        <span className="font-semibold text-white">{lastResult.attendeeName}</span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                        <span className="text-slate-400 text-xs">Sự kiện:</span>
                        <span className="font-medium text-slate-200 text-right max-w-[200px] truncate">{lastResult.eventTitle}</span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                        <span className="text-slate-400 text-xs">Chỗ ngồi:</span>
                        <span className="font-extrabold text-emerald-400 text-base">{lastResult.seatLabel}</span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                        <span className="text-slate-400 text-xs">Hạng vé:</span>
                        <span className="text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-300">{lastResult.category}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-slate-500 pt-1">
                        <span>Thời điểm quét:</span>
                        <span>{new Date(lastResult.checkedInAt).toLocaleTimeString('vi-VN')}</span>
                      </div>
                    </div>
                  </div>
                ) : lastResult.status === 'ALREADY_CHECKED_IN' ? (
                  /* VÉ ĐÃ ĐƯỢC CHECK-IN TRƯỚC ĐÓ (S-29 AC2 CẢNH BÁO CỬA ĐÃ VÀO) */
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200 flex items-start gap-3 animate-pulse">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-extrabold text-base text-amber-300">CẢNH BÁO: VÉ ĐÃ CHECK-IN</div>
                        <div className="text-xs text-amber-200/90 mt-0.5">{lastResult.message}</div>
                      </div>
                    </div>

                    <div className="bg-slate-900/90 rounded-2xl p-4 border border-amber-900/40 space-y-2 text-xs">
                      <div className="flex justify-between text-slate-400 pb-1.5 border-b border-slate-800">
                        <span>Cửa quét hiện tại:</span>
                        <span className="font-bold text-amber-300">📍 {selectedGate}</span>
                      </div>
                      {lastResult.firstGate && (
                        <div className="flex justify-between text-slate-400 pb-1.5 border-b border-slate-800">
                          <span>Đã vào lần đầu tại cửa:</span>
                          <span className="font-bold text-rose-300">📍 {lastResult.firstGate}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-400">
                        <span>Mã vé:</span>
                        <span className="font-mono text-white">{lastResult.code}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Check-in lần đầu lúc:</span>
                        <span className="font-bold text-amber-400">
                          {lastResult.firstCheckedInAt ? new Date(lastResult.firstCheckedInAt).toLocaleString('vi-VN') : 'Trước đó'}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Người soát vé trước:</span>
                        <span className="text-slate-300">{lastResult.checkedInBy || 'Nhân viên cổng'}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* VÉ KHÔNG HỢP LỆ */
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0 mt-0.5">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-extrabold text-base text-rose-200">TỪ CHỐI - VÉ KHÔNG HỢP LỆ</div>
                        <div className="text-xs text-rose-300/80 mt-0.5">{lastResult.message}</div>
                      </div>
                    </div>

                    <div className="bg-slate-900/90 rounded-2xl p-4 border border-rose-900/40 text-xs text-slate-400 space-y-2">
                      <div className="flex justify-between">
                        <span>Cửa phát hiện:</span>
                        <span className="font-semibold text-slate-200">📍 {selectedGate}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Mã tra cứu:</span>
                        <span className="font-mono text-rose-400">{lastResult.code}</span>
                      </div>
                      <p className="text-slate-500 text-[11px] pt-1 border-t border-slate-800">
                        Vé không tìm thấy trong cơ sở dữ liệu hệ thống hoặc chưa được thanh toán thành công.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* DANH SÁCH LỊCH SỬ CÁC LƯỢT QUÉT GẦN NHẤT */}
              <div className="bg-slate-800/80 border border-slate-700 rounded-3xl p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Lịch sử lượt quét tại cửa ({scansList.length})
                  </h3>
                  <button onClick={fetchRecent} className="text-xs text-emerald-400 hover:text-emerald-300">
                    Làm mới
                  </button>
                </div>

                {scansList.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">Chưa có lượt quét nào gần đây.</p>
                ) : (
                  <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                    {scansList.slice(0, 15).map((scan, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              scan.status === 'VALID'
                                ? 'bg-emerald-400'
                                : scan.status === 'ALREADY_CHECKED_IN'
                                ? 'bg-amber-400'
                                : 'bg-rose-400'
                            }`}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-medium text-slate-200">{scan.code}</span>
                              {scan.gate && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                  {scan.gate}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {scan.attendeeName ? `${scan.attendeeName} · ` : ''}
                              {scan.seatLabel ? `Ghế ${scan.seatLabel}` : ''}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                              scan.status === 'VALID'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : scan.status === 'ALREADY_CHECKED_IN'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-rose-500/10 text-rose-400'
                            }`}
                          >
                            {scan.status === 'VALID'
                              ? 'Hợp lệ'
                              : scan.status === 'ALREADY_CHECKED_IN'
                              ? 'Trùng lặp'
                              : 'Không hợp lệ'}
                          </span>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {scan.scannedAt || scan.checkedInAt
                              ? new Date(scan.scannedAt || scan.checkedInAt).toLocaleTimeString('vi-VN')
                              : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── S-29 AC1 & AC2: MODAL KHAI BÁO SUẤT DIỄN HÔM NAY VÀ TÊN CỬA ──────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative overflow-hidden text-slate-100">
            {/* Header Modal */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Khai báo điểm soát vé (S-29)</h3>
                  <p className="text-xs text-slate-400">Chọn suất diễn đang diễn ra hôm nay và cửa bạn đang trực</p>
                </div>
              </div>
              {selectedShowtime && selectedGate && (
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="space-y-5 my-5">
              {/* Bước 1: Chọn Suất diễn */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  1. Chọn suất diễn hôm nay ({new Date().toLocaleDateString('vi-VN')}) *
                </label>
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {todayShowtimes.map((st) => (
                    <div
                      key={st.id}
                      onClick={() => setTempShowtimeId(st.id.toString())}
                      className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                        tempShowtimeId === st.id.toString()
                          ? 'bg-emerald-950/40 border-emerald-500/80 shadow-md shadow-emerald-950/30'
                          : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-sm text-white">{st.event_title}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{st.event_venue}</div>
                        <div className="inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded-md bg-slate-900/80 text-[11px] font-mono text-emerald-400 border border-slate-700/50">
                          🕒 Bắt đầu: {new Date(st.starts_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div className="pt-1">
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            tempShowtimeId === st.id.toString()
                              ? 'border-emerald-400 bg-emerald-400'
                              : 'border-slate-500'
                          }`}
                        >
                          {tempShowtimeId === st.id.toString() && (
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bước 2: Chọn Cửa soát vé */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  2. Chọn tên cửa đang trực (Gate name) *
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {availableGates.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => {
                        setTempGate(g)
                        setIsCustomGate(false)
                      }}
                      className={`p-2.5 rounded-xl text-xs font-semibold border transition-all text-left flex items-center justify-between ${
                        !isCustomGate && tempGate === g
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 shadow-sm'
                          : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700/80'
                      }`}
                    >
                      <span>📍 {g}</span>
                      {!isCustomGate && tempGate === g && <span>✓</span>}
                    </button>
                  ))}
                </div>

                {/* Tùy chọn nhập cửa khác nếu sự kiện có cửa phụ */}
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomGate(!isCustomGate)
                      if (!isCustomGate && !customGate) setCustomGate('Cổng phụ')
                    }}
                    className="text-xs text-sky-400 hover:underline flex items-center gap-1"
                  >
                    <span>+ {isCustomGate ? 'Chọn lại cửa trong danh sách' : 'Nhập tên cửa khác nếu không có trong danh sách'}</span>
                  </button>

                  {isCustomGate && (
                    <input
                      type="text"
                      value={customGate}
                      onChange={(e) => setCustomGate(e.target.value)}
                      placeholder="VD: Cửa 3 - Khán đài C"
                      className="mt-2 w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Actions Modal */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
              {selectedShowtime && selectedGate && (
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                >
                  Hủy
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveSelection}
                disabled={!tempShowtimeId || (!isCustomGate && !tempGate) || (isCustomGate && !customGate.trim())}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-all shadow-lg shadow-emerald-950/60"
              >
                ✓ Bắt đầu soát vé tại cửa này
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  )
}
