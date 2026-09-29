import { Link } from 'react-router-dom'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'

// ── Mock data ─────────────────────────────────────────────────────────────────
const MOCK_EVENTS = [
  {
    id: 1,
    title: 'Hoa nhac Symphony Mua Thu 2026',
    category: 'Am nhac',
    date: '15 Thang 10, 2026',
    time: '20:00',
    location: 'Nha hat Lon Ha Noi',
    price: '350,000',
    image: null,
    badge: 'HOT',
    color: 'from-violet-500 to-purple-600',
    emoji: '🎵',
  },
  {
    id: 2,
    title: 'Vietnam Tech Summit 2026',
    category: 'Cong nghe',
    date: '22 Thang 10, 2026',
    time: '09:00',
    location: 'GEM Center, TP.HCM',
    price: '500,000',
    image: null,
    badge: 'MOI',
    color: 'from-blue-500 to-cyan-600',
    emoji: '💻',
  },
  {
    id: 3,
    title: 'V.League 2026 – Ha Noi FC vs HAGL',
    category: 'The thao',
    date: '30 Thang 10, 2026',
    time: '19:30',
    location: 'San van dong Hang Day',
    price: '150,000',
    image: null,
    badge: null,
    color: 'from-green-500 to-emerald-600',
    emoji: '⚽',
  },
  {
    id: 4,
    title: 'Stand-up Comedy Night',
    category: 'Giai tri',
    date: '5 Thang 11, 2026',
    time: '21:00',
    location: "B'estival, Da Nang",
    price: '250,000',
    image: null,
    badge: null,
    color: 'from-orange-400 to-pink-500',
    emoji: '🎤',
  },
  {
    id: 5,
    title: 'Trien lam Nghe thuat Duong dai',
    category: 'Nghe thuat',
    date: '10 Thang 11, 2026',
    time: '10:00',
    location: 'Bao tang My thuat TP.HCM',
    price: '80,000',
    image: null,
    badge: null,
    color: 'from-rose-400 to-pink-600',
    emoji: '🖼️',
  },
  {
    id: 6,
    title: 'Gaming Festival Vietnam 2026',
    category: 'Cong nghe',
    date: '20 Thang 11, 2026',
    time: '10:00',
    location: 'ICH, TP.HCM',
    price: '200,000',
    image: null,
    badge: 'SAP MO BAN',
    color: 'from-indigo-500 to-purple-600',
    emoji: '🎮',
  },
]

const CATEGORIES = ['Tat ca', 'Am nhac', 'Cong nghe', 'The thao', 'Giai tri', 'Nghe thuat']

export default function EventListPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero banner */}
        <section className="bg-gradient-to-br from-violet-900 via-purple-900 to-pink-900 text-white py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Kham pha{' '}
              <span className="bg-gradient-to-r from-pink-300 to-orange-300 bg-clip-text text-transparent">
                su kien
              </span>{' '}
              gan ban
            </h1>
            <p className="text-white/70 text-lg mb-8">
              Hang tram su kien dang cho ban moi tuan
            </p>

            {/* Search bar */}
            <div className="max-w-xl mx-auto flex gap-2">
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
                  type="text"
                  placeholder="Tim su kien, nghe si, dia diem..."
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
              </div>
              <button className="bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-pink-500/30">
                Tim
              </button>
            </div>
          </div>
        </section>

        {/* Category filter */}
        <section className="sticky top-16 z-30 bg-white border-b border-gray-100 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex gap-2 py-3 overflow-x-auto">
              {CATEGORIES.map((cat, i) => (
                <button
                  key={cat}
                  className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                    i === 0
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
              Su kien noi bat
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({MOCK_EVENTS.length} su kien)
              </span>
            </h2>
            <select className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-pink-400">
              <option>Moi nhat</option>
              <option>Gia thap den cao</option>
              <option>Gia cao den thap</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {MOCK_EVENTS.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}

function EventCard({ event }) {
  return (
    <Link
      to={`/events/${event.id}`}
      className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl border border-gray-100 transition-all duration-300 hover:-translate-y-1"
    >
      {/* Thumbnail */}
      <div className={`h-48 bg-gradient-to-br ${event.color} relative flex items-center justify-center`}>
        <span className="text-6xl">{event.emoji}</span>
        {event.badge && (
          <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-xs font-bold px-2.5 py-1 rounded-full text-gray-800 shadow-sm">
            {event.badge}
          </span>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-pink-600 bg-pink-50 px-2.5 py-0.5 rounded-full">
            {event.category}
          </span>
        </div>
        <h3 className="font-bold text-gray-900 text-sm leading-snug mb-3 group-hover:text-pink-600 transition-colors line-clamp-2">
          {event.title}
        </h3>

        <div className="space-y-1.5 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {event.date} &middot; {event.time}
          </div>
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="truncate">{event.location}</span>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <div>
            <span className="text-xs text-gray-400">Tu</span>
            <div className="font-bold text-gray-900 text-sm">{event.price}&#8363;</div>
          </div>
          <span className="text-xs font-semibold text-pink-600 bg-pink-50 px-3 py-1.5 rounded-lg group-hover:bg-pink-600 group-hover:text-white transition-colors">
            Mua ve &rarr;
          </span>
        </div>
      </div>
    </Link>
  )
}
