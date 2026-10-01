import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const roleLabels = {
  admin: { label: 'Admin', color: 'bg-red-100 text-red-700' },
  organizer: { label: 'Organizer', color: 'bg-purple-100 text-purple-700' },
  buyer: { label: 'Buyer', color: 'bg-blue-100 text-blue-700' },
}

const getNavLinks = (role) => [
  { to: '/events', label: 'Sự kiện' },
  ...(role === 'organizer' || role === 'admin' ? [{ to: '/organizer', label: 'Quản lý' }] : []),
  ...(role === 'admin' ? [{ to: '/admin', label: 'Admin' }] : []),
]

const navClass = ({ isActive }) =>
  `text-sm font-medium transition-colors ${isActive ? 'text-pink-600' : 'text-gray-600 hover:text-pink-600'}`

export default function Header() {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = () => {
    setMenuOpen(false)
    logout()
    navigate('/login')
  }

  const roleInfo = user?.role ? roleLabels[user.role] : null
  const displayName = user?.fullName || user?.name || user?.email
  const links = getNavLinks(user?.role)

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

          {/* Nav links (desktop) */}
          <nav className="hidden md:flex items-center gap-6">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={navClass}>{l.label}</NavLink>
            ))}
          </nav>

          {/* Auth area */}
          <div className="flex items-center gap-3">
            {isAuthenticated && user ? (
              <>
                {roleInfo && (
                  <span className={`hidden sm:inline-flex text-xs font-medium px-2.5 py-1 rounded-full ${roleInfo.color}`}>
                    {roleInfo.label}
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white text-sm font-semibold shadow">
                    {(displayName || 'U')[0].toUpperCase()}
                  </div>
                  <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[140px] truncate">
                    {displayName}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="hidden md:block text-sm font-medium text-gray-500 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
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

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
              aria-label="Mở menu"
              aria-expanded={menuOpen}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d={menuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <nav className="md:hidden border-t border-gray-100 bg-white px-4 py-3 space-y-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm font-medium ${isActive ? 'bg-pink-50 text-pink-600' : 'text-gray-700 hover:bg-gray-50'}`
              }
            >
              {l.label}
            </NavLink>
          ))}
          {isAuthenticated && user && (
            <button
              onClick={handleLogout}
              className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Đăng xuất
            </button>
          )}
        </nav>
      )}
    </header>
  )
}
