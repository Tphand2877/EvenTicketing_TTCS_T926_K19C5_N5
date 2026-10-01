import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'
import EventDetail from '../components/event/EventDetail'
import { getErrorMessage } from '../components/event/eventFormat'
import { getEvent } from '../services/eventService'

export default function EventDetailPage() {
  const { id } = useParams()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getEvent(id)
      .then((result) => { if (!cancelled) setData(result) })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Không tải được thông tin sự kiện.'))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {loading && (
          <div className="flex justify-center py-24">
            <div className="w-10 h-10 border-4 border-pink-200 border-t-pink-600 rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-24 px-4">
            <div className="text-6xl mb-4">😕</div>
            <p className="text-gray-600 mb-6">{error}</p>
            <Link to="/events" className="text-sm font-semibold text-pink-600 hover:underline">
              &larr; Về danh sách sự kiện
            </Link>
          </div>
        )}

        {!loading && !error && data && (
          <EventDetail event={data.event} showtimes={data.showtimes} />
        )}
      </main>
      <Footer />
    </div>
  )
}
