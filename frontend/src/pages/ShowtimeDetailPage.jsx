import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'
import { formatDateTime, formatPriceRange, getCategoryStyle, getErrorMessage } from '../components/event/eventFormat'
import { getPublicShowtime } from '../services/eventService'

/**
 * SCRUM-162 (T-18): Trang chi tiết suất diễn
 * - AC2: Suất diễn nháp/đã đóng -> hiện thông báo không mở bán, KHÔNG THẤY SƠ ĐỒ.
 * - AC3: Suất diễn đang mở bán -> hiện tên sự kiện, thời gian, địa điểm, khoảng giá và nút vào chọn ghế.
 */
export default function ShowtimeDetailPage() {
  const { id } = useParams()
  const [showtime, setShowtime] = useState(null)
  const [onSale, setOnSale]     = useState(false)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    getPublicShowtime(id)
      .then((data) => {
        if (cancelled) return
        setShowtime(data.showtime)
        setOnSale(Boolean(data.on_sale))
      })
      .catch((err) => {
        if (cancelled) return
        const msg = getErrorMessage(err, 'Không thể tải thông tin suất diễn.')
        if (err?.response?.status === 404) {
          setError(msg || 'Không tìm thấy suất diễn.')
        } else {
          // Khi suất diễn không mở bán hoặc lỗi từ backend
          setOnSale(false)
          setError(msg)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  const categoryStyle = getCategoryStyle(showtime?.category)

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />

      <main className="flex-1 py-12">
        {loading && (
          <div className="flex justify-center py-24">
            <div className="w-10 h-10 border-4 border-pink-200 border-t-pink-600 rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && !showtime && (
          <div className="max-w-xl mx-auto text-center py-16 px-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="text-6xl mb-4">😕</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">{error}</h1>
            <p className="text-gray-500 mb-6 text-sm">Suất diễn bạn yêu cầu không tồn tại hoặc đã bị gỡ.</p>
            <Link to="/events" className="btn-primary inline-block">
              &larr; Về danh sách sự kiện
            </Link>
          </div>
        )}

        {!loading && showtime && (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            {/* Breadcrumb */}
            <div className="text-xs text-gray-500 flex items-center gap-1.5">
              <Link to="/events" className="hover:text-pink-600 transition-colors">Sự kiện</Link>
              <span>/</span>
              {showtime.event_id && (
                <>
                  <Link to={`/events/${showtime.event_id}`} className="hover:text-pink-600 transition-colors truncate max-w-xs">
                    {showtime.title}
                  </Link>
                  <span>/</span>
                </>
              )}
              <span className="text-gray-900 font-medium">Chi tiết suất diễn #{showtime.id}</span>
            </div>

            {/* AC2: Suất diễn ở trạng thái nháp hoặc đã đóng (on_sale === false) */}
            {!onSale ? (
              <div className="bg-white rounded-2xl border border-amber-200 p-8 shadow-sm space-y-6 text-center">
                <div className="w-16 h-16 mx-auto bg-amber-100 text-amber-800 rounded-full flex items-center justify-center text-3xl">
                  ⚠️
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold text-gray-900">{showtime.title}</h1>
                  <div
                    role="alert"
                    className="inline-block bg-amber-50 border border-amber-300 text-amber-900 font-semibold px-4 py-2 rounded-xl text-sm"
                  >
                    Suất diễn không mở bán
                  </div>
                  <p className="text-sm text-gray-500 max-w-md mx-auto">
                    Suất diễn này đang ở trạng thái nháp, đã đóng hoặc chưa mở bán vé. Sơ đồ ghế không khả dụng cho suất diễn này.
                  </p>
                </div>

                <div className="pt-4 border-t border-gray-100 flex justify-center gap-4">
                  <Link to="/events" className="btn-primary inline-flex items-center gap-2">
                    &larr; Xem các sự kiện đang mở bán khác
                  </Link>
                </div>
              </div>
            ) : (
              /* AC3: Suất diễn đang mở bán -> Hiện tên sự kiện, thời gian, địa điểm, khoảng giá và nút vào chọn ghế */
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                {/* Banner / Category Header */}
                <div className={`h-48 bg-gradient-to-r ${categoryStyle.color} p-8 text-white flex flex-col justify-end relative`}>
                  {showtime.image_url && (
                    <img
                      src={showtime.image_url}
                      alt={showtime.title}
                      className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-60"
                    />
                  )}
                  <span className="inline-block text-xs font-semibold bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full w-fit mb-2">
                    {showtime.category || 'Sự kiện'}
                  </span>
                  <h1 className="text-3xl font-bold leading-tight drop-shadow-sm">{showtime.title}</h1>
                </div>

                {/* Thông tin chi tiết suất diễn (AC3) */}
                <div className="p-6 md:p-8 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4 border-y border-gray-100 text-sm">
                    {/* Thời gian */}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 font-medium uppercase">Thời gian</div>
                        <div className="font-semibold text-gray-900 mt-0.5">
                          {formatDateTime(showtime.starts_at)}
                        </div>
                        {showtime.ends_at && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            Đến: {formatDateTime(showtime.ends_at)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Địa điểm */}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 font-medium uppercase">Địa điểm</div>
                        <div className="font-semibold text-gray-900 mt-0.5">{showtime.venue}</div>
                      </div>
                    </div>

                    {/* Khoảng giá */}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 font-medium uppercase">Khoảng giá vé</div>
                        <div className="font-bold text-gray-900 text-base mt-0.5">
                          {formatPriceRange(showtime.min_price, showtime.max_price, showtime.price)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Giới thiệu nếu có */}
                  {showtime.description && (
                    <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                      {showtime.description}
                    </div>
                  )}

                  {/* Nút vào chọn ghế (AC3) */}
                  <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-gray-100">
                    <div>
                      <span className="text-xs text-gray-400 block">Trạng thái mở bán</span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full mt-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Đang mở bán
                      </span>
                    </div>

                    <Link
                      to={`/events/${showtime.event_id || showtime.id}?showtimeId=${showtime.id}`}
                      className="btn-primary text-base font-semibold px-8 py-3.5 shadow-lg shadow-pink-500/25 flex items-center gap-2"
                    >
                      <span>Vào chọn ghế</span>
                      <span>&rarr;</span>
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
