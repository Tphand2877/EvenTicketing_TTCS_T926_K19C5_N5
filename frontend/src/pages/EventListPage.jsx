import { useCallback, useEffect, useState } from 'react'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'
import EventListView from '../components/event/EventListView'
import { CATEGORIES, getErrorMessage } from '../components/event/eventFormat'
import { getEvents } from '../services/eventService'

const ALL = 'Tất cả'
const PAGE_SIZE = 12

export default function EventListPage() {
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery]             = useState('')
  const [category, setCategory]       = useState(ALL)
  const [page, setPage]               = useState(1)

  const [events, setEvents]         = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getEvents({
        q: query || undefined,
        category: category === ALL ? undefined : category,
        page,
        limit: PAGE_SIZE,
      })
      setEvents(data.events)
      setPagination(data.pagination)
    } catch (err) {
      setError(getErrorMessage(err, 'Không tải được danh sách sự kiện.'))
    } finally {
      setLoading(false)
    }
  }, [query, category, page])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

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
              Hàng trăm sự kiện đang chờ bạn mỗi tuần
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
                className="bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-pink-500/30"
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
              {query ? `Kết quả cho "${query}"` : 'Sự kiện nổi bật'}
              {pagination && (
                <span className="ml-2 text-sm font-normal text-gray-400">
                  ({pagination.total} sự kiện)
                </span>
              )}
            </h2>
          </div>

          <EventListView events={events} loading={loading} error={error} onRetry={loadEvents} />

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-10">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1 || loading}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 disabled:opacity-40"
              >
                &larr; Trước
              </button>
              <span className="text-sm text-gray-500">
                Trang {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= pagination.totalPages || loading}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 disabled:opacity-40"
              >
                Sau &rarr;
              </button>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  )
}
