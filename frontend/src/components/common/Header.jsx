import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const roleLabels = {
  admin: { label: 'Admin', color: 'bg-red-100 text-red-700' },
  organizer: { label: 'Organizer', color: 'bg-purple-100 text-purple-700' },
  buyer: { label: 'Buyer', color: 'bg-blue-100 text-blue-700' },
}

export default function Header() {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const roleInfo = user?.role ? roleLabels[user.role] : null

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center shadow-md">
              <span className="text-white font-bold text-sm">ET</span>
            </div>
            <span className="font-bold text-lg text-gradient hidden sm:block">
              EvenTicketing
            </span>
          </Link>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              to="/events"
              className="text-sm font-medium text-gray-600 hover:text-pink-600 transition-colors"
            >
              Sự kiện
            </Link>
            {user?.role === 'organizer' && (
              <Link
                to="/organizer"
                className="text-sm font-medium text-gray-600 hover:text-pink-600 transition-colors"
              >
                Quản lý
              </Link>
            )}
            {user?.role === 'admin' && (
              <Link
                to="/admin"
                className="text-sm font-medium text-gray-600 hover:text-pink-600 transition-colors"
              >
                Admin
              </Link>
            )}
          </nav>

          {/* Auth area */}
          <div className="flex items-center gap-3">
            {isAuthenticated && user ? (
              <>
                {/* Role badge */}
                {roleInfo && (
                  <span className={`hidden sm:inline-flex text-xs font-medium px-2.5 py-1 rounded-full ${roleInfo.color}`}>
                    {roleInfo.label}
                  </span>
                )}
                {/* User avatar */}
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white text-sm font-semibold shadow">
                    {(user.name || user.email || 'U')[0].toUpperCase()}
                  </div>
                  <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[120px] truncate">
                    {user.name || user.email}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-sm font-medium text-gray-500 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
                >
                  Đăng xuất
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm font-medium text-gray-600 hover:text-pink-600 transition-colors"
                >
                  Đăng nhập
                </Link>
                <Link
                  to="/register"
                  className="text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-pink-600 px-4 py-2 rounded-xl hover:from-violet-700 hover:to-pink-700 transition-all shadow-md shadow-pink-200 hover:shadow-pink-300"
                >
                  Đăng ký
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
