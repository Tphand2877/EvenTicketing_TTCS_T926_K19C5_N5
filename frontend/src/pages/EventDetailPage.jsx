import { useParams, Link } from 'react-router-dom'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'

export default function EventDetailPage() {
  const { id } = useParams()

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <div className="h-72 bg-gradient-to-br from-violet-500 to-pink-600 flex items-center justify-center text-white relative">
          <span className="text-8xl">🎵</span>
          <div className="absolute inset-0 bg-black/20" />
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main info */}
            <div className="lg:col-span-2 space-y-6">
              <div>
                <span className="inline-block text-xs font-semibold text-pink-600 bg-pink-50 px-3 py-1 rounded-full mb-3">
                  Âm nhạc
                </span>
                <h1 className="text-3xl font-bold text-gray-900">
                  Hòa nhạc Symphony Mùa Thu 2026
                </h1>
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  15 Tháng 10, 2026 · 20:00
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Nhà hát Lớn Hà Nội
                </div>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Giới thiệu</h2>
                <p className="text-gray-600 leading-relaxed">
                  Đêm nhạc giao hưởng hoành tráng với sự tham gia của Dàn nhạc Giao hưởng Quốc gia Việt Nam.
                  Chương trình bao gồm các tác phẩm kinh điển của Beethoven, Mozart và các nhạc sĩ Việt Nam đương đại.
                </p>
              </div>
            </div>

            {/* Booking card */}
            <div>
              <div className="sticky top-20 card-auth">
                <h3 className="font-bold text-gray-900 mb-4">Chọn vé</h3>
                <div className="space-y-3 mb-5">
                  {[
                    { type: 'Hạng phổ thông', price: '350,000₫' },
                    { type: 'Hạng VIP', price: '700,000₫' },
                    { type: 'Hạng VVIP', price: '1,200,000₫' },
                  ].map(({ type, price }) => (
                    <label key={type} className="flex items-center justify-between p-3 border border-gray-200 rounded-xl cursor-pointer hover:border-pink-400 hover:bg-pink-50/50 transition-all">
                      <div className="flex items-center gap-2">
                        <input type="radio" name="ticket" className="text-pink-600" />
                        <span className="text-sm font-medium text-gray-700">{type}</span>
                      </div>
                      <span className="text-sm font-bold text-gray-900">{price}</span>
                    </label>
                  ))}
                </div>
                <Link to="/checkout" className="btn-primary block text-center">
                  Đặt vé ngay
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
