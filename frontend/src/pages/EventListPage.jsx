import { useCallback, useEffect, useRef, useState } from 'react'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'
import EventListView from '../components/event/EventListView'
import { CATEGORIES, getErrorMessage } from '../components/event/eventFormat'
import { getEvents } from '../services/eventService'

const ALL = 'Tất cả'
const PAGE_SIZE = 20

/**
 * SCRUM-162 / S-08 (T-18): Trang danh sách sự kiện đang mở bán
 * - AC1: Chưa đăng nhập vẫn thấy danh sách sự kiện kèm suất gần nhất, sắp theo ngày diễn
 * - AC4: Khi có hơn 20 sự kiện, cuộn xuống cuối tự động tải thêm trang tiếp theo (infinite scroll)
 */
export default function EventListPage() {
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery]             = useState('')
  const [category, setCategory]       = useState(ALL)
  const [page, setPage]               = useState(1)

  const [events, setEvents]           = useState([])
  const [pagination, setPagination]   = useState(null)
  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError]             = useState(null)

  const sentinelRef = useRef(null)

  const loadEvents = useCallback(async (targetPage = 1, append = false) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    setError(null)
    try {
      const data = await getEvents({
        q: query || undefined,
        category: category === ALL ? undefined : category,
        page: targetPage,
        limit: PAGE_SIZE,
      })

      if (append) {
        setEvents((prev) => {
          const existingIds = new Set(prev.map((e) => e.id))
          const newItems = (data.events || []).filter((e) => !existingIds.has(e.id))
          return [...prev, ...newItems]
        })
      } else {
        setEvents(data.events || [])
      }
      setPagination(data.pagination)
    } catch (err) {
      setError(getErrorMessage(err, 'Không tải được danh sách sự kiện.'))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [query, category])

  // Tải lại trang đầu khi thay đổi bộ lọc hoặc từ khóa tìm kiếm
  useEffect(() => {
    setPage(1)
    loadEvents(1, false)
  }, [loadEvents])

  // AC4: Khi cuộn xuống cuối và còn trang tiếp theo, tự động tải thêm trang tiếp theo
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (
          first.isIntersecting &&
          !loading &&
          !loadingMore &&
          pagination &&
          page < pagination.totalPages
        ) {
          const nextPage = page + 1
          setPage(nextPage)
          loadEvents(nextPage, true)
        }
      },
      { rootMargin: '250px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loading, loadingMore, pagination, page, loadEvents])

  const handleManualLoadMore = () => {
    if (loading || loadingMore || !pagination || page >= pagination.totalPages) return
    const nextPage = page + 1
    setPage(nextPage)
    loadEvents(nextPage, true)
  }

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(1)
    setQuery(searchInput.trim())
  }

  const handleCategory = (cat) => {
    setPage(1)
    setCategory(cat)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero banner */}
        <section className="bg-gradient-to-br from-violet-900 via-purple-900 to-pink-900 text-white py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Khám phá{' '}
              <span className="bg-gradient-to-r from-pink-300 to-orange-300 bg-clip-text text-transparent">
                sự kiện
              </span>{' '}
              gần bạn
            </h1>
            <p className="text-white/70 text-lg mb-8">
              Hàng trăm sự kiện và suất diễn đang mở bán mỗi tuần
            </p>

            {/* Search bar */}
            <form onSubmit={handleSearch} className="max-w-xl mx-auto flex gap-2">
              <div className="relative flex-1">
                <svg
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Tìm sự kiện theo tên..."
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
              </div>
              <button
                type="submit"
                className="bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-pink-500/30 active:scale-95"
              >
                Tìm
              </button>
            </form>
          </div>
        </section>

        {/* Category filter */}
        <section className="sticky top-16 z-30 bg-white border-b border-gray-100 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex gap-2 py-3 overflow-x-auto">
              {[ALL, ...CATEGORIES].map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleCategory(cat)}
                  className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                    cat === category
                      ? 'bg-gradient-to-r from-violet-600 to-pink-600 text-white shadow-md shadow-pink-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Events grid */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              {query ? `Kết quả cho "${query}"` : 'Sự kiện nổi bật đang mở bán'}
              {pagination && (
                <span className="ml-2 text-sm font-normal text-gray-400">
                  ({events.length} / {pagination.total} sự kiện)
                </span>
              )}
            </h2>
          </div>

          <EventListView
            events={events}
            loading={loading && events.length === 0}
            error={error}
            onRetry={() => loadEvents(1, false)}
          />

          {/* AC4: Vùng sentinel cuộn xuống dưới cùng để tải thêm */}
          {pagination && page < pagination.totalPages && (
            <div ref={sentinelRef} className="py-8 flex flex-col items-center justify-center gap-3">
              {loadingMore ? (
                <div className="flex items-center gap-2 text-sm text-pink-600">
                  <div className="w-5 h-5 border-2 border-pink-200 border-t-pink-600 rounded-full animate-spin" />
                  <span>Đang tải thêm sự kiện...</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleManualLoadMore}
                  className="px-6 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-semibold text-gray-700 shadow-sm transition-all"
                >
                  Cuộn xuống hoặc bấm để tải thêm
                </button>
              )}
            </div>
          )}

          {pagination && page >= pagination.totalPages && events.length > 0 && (
            <div className="text-center py-8 text-xs text-gray-400">
              &bull; Đã hiển thị tất cả sự kiện đang mở bán &bull;
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  )
}
