import { Link } from 'react-router-dom'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="bg-gray-900 text-gray-400 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">ET</span>
              </div>
              <span className="font-bold text-white text-lg">EvenTicketing</span>
            </div>
            <p className="text-sm leading-relaxed text-gray-400 max-w-xs">
              Nền tảng mua bán vé sự kiện trực tuyến hàng đầu Việt Nam. An toàn, nhanh chóng và tiện lợi.
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">Khám phá</h3>
            <ul className="space-y-2 text-sm">
              <li><Link to="/events" className="hover:text-white transition-colors">Sự kiện</Link></li>
              <li><Link to="/events?cat=music" className="hover:text-white transition-colors">Âm nhạc</Link></li>
              <li><Link to="/events?cat=sport" className="hover:text-white transition-colors">Thể thao</Link></li>
              <li><Link to="/events?cat=tech" className="hover:text-white transition-colors">Công nghệ</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold text-sm mb-4">Hỗ trợ</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white transition-colors">Trung tâm trợ giúp</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Chính sách hoàn vé</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Điều khoản dịch vụ</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Liên hệ</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-500">
            &copy; {year} EvenTicketing. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Cookies</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
