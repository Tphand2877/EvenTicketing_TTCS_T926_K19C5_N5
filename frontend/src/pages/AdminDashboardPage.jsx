import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'
import { formatPrice, getErrorMessage } from '../components/event/eventFormat'
import { deleteEvent, getMyEvents, updateEvent } from '../services/eventService'
import {
  getUsers,
  createStaffUser,
  updateUserRole,
  toggleUserStatus,
  getRoleChangeLogs,
} from '../services/adminService'

const EVENT_STATUS_FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'published', label: 'Công khai' },
  { value: 'draft', label: 'Nháp' },
]

const ROLE_OPTIONS = [
  { value: 'all', label: 'Tất cả vai trò' },
  { value: 'admin', label: 'Admin (Quản trị)', color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'organizer', label: 'Organizer (Ban tổ chức)', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'ticket_checker', label: 'Soát vé (Ticket Checker)', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'accountant', label: 'Kế toán (Accountant)', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'buyer', label: 'Buyer (Người mua)', color: 'bg-blue-100 text-blue-700 border-blue-200' },
]

function StatCard({ label, value, accent, subtext }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="text-sm text-gray-500 font-medium">{label}</div>
      <div className={`text-3xl font-extrabold mt-1 ${accent}`}>{value}</div>
      {subtext && <div className="text-xs text-gray-400 mt-1">{subtext}</div>}
    </div>
  )
}

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState('users') // 'events' | 'users' | 'logs'

  // ── State sự kiện ──────────────────────────────────────────────────────────
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventSearch, setEventSearch] = useState('')
  const [eventStatus, setEventStatus] = useState('all')

  // ── State người dùng & phân quyền (S-28) ────────────────────────────────────
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('all')
  const [userStatusFilter, setUserStatusFilter] = useState('all')
  const [userPagination, setUserPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 })

  // ── Modal tạo nhân viên ────────────────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'ticket_checker',
  })
  const [creating, setCreating] = useState(false)

  // ── Modal đổi vai trò ──────────────────────────────────────────────────────
  const [roleModalUser, setRoleModalUser] = useState(null)
  const [newRoleSelect, setNewRoleSelect] = useState('')
  const [roleChangeReason, setRoleChangeReason] = useState('')
  const [updatingRole, setUpdatingRole] = useState(false)

  // ── State nhật ký kiểm toán (S-28 NFR-1) ────────────────────────────────────
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsPagination, setLogsPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 })

  // ── Notifications ──────────────────────────────────────────────────────────
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  // Tải danh sách sự kiện
  const loadEvents = useCallback(async () => {
    setEventsLoading(true)
    try {
      setEvents(await getMyEvents())
    } catch (err) {
      setError(getErrorMessage(err, 'Không tải được danh sách sự kiện.'))
    } finally {
      setEventsLoading(false)
    }
  }, [])

  // Tải danh sách người dùng (S-28)
  const loadUsers = useCallback(async (page = 1) => {
    setUsersLoading(true)
    try {
      const res = await getUsers({
        page,
        limit: 20,
        search: userSearch,
        role: userRoleFilter,
        status: userStatusFilter,
      })
      setUsers(res.users || [])
      setUserPagination(res.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 })
    } catch (err) {
      setError(getErrorMessage(err, 'Không tải được danh sách người dùng.'))
    } finally {
      setUsersLoading(false)
    }
  }, [userSearch, userRoleFilter, userStatusFilter])

  // Tải nhật ký audit logs (S-28 NFR-1)
  const loadLogs = useCallback(async (page = 1) => {
    setLogsLoading(true)
    try {
      const res = await getRoleChangeLogs({ page, limit: 20 })
      setLogs(res.logs || [])
      setLogsPagination(res.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 })
    } catch (err) {
      setError(getErrorMessage(err, 'Không tải được nhật ký kiểm toán.'))
    } finally {
      setLogsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'events') loadEvents()
    if (activeTab === 'users') loadUsers()
    if (activeTab === 'logs') loadLogs()
  }, [activeTab, loadEvents, loadUsers, loadLogs])

  // ── Xử lý tạo nhân viên mới (S28-T3) ─────────────────────────────────────────
  const handleCreateStaff = async (e) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setCreating(true)

    try {
      const res = await createStaffUser(createForm)
      setNotice(res.message || 'Tạo tài khoản nhân viên thành công.')
      setShowCreateModal(false)
      setCreateForm({ email: '', password: '', full_name: '', role: 'ticket_checker' })
      await loadUsers()
    } catch (err) {
      setError(getErrorMessage(err, 'Lỗi khi tạo tài khoản nhân viên.'))
    } finally {
      setCreating(false)
    }
  }

  // ── Xử lý đổi vai trò (S-28 AC2) ───────────────────────────────────────────
  const handleOpenRoleModal = (user) => {
    setRoleModalUser(user)
    setNewRoleSelect(user.role)
    setRoleChangeReason('')
  }

  const handleSubmitRoleChange = async (e) => {
    e.preventDefault()
    if (!roleModalUser || !newRoleSelect) return

    setError(null)
    setNotice(null)
    setUpdatingRole(true)

    try {
      const res = await updateUserRole(roleModalUser.id, {
        role: newRoleSelect,
        reason: roleChangeReason,
      })
      setNotice(res.message || 'Đã cập nhật vai trò người dùng thành công.')
      setRoleModalUser(null)
      await loadUsers(userPagination.page)
    } catch (err) {
      setError(getErrorMessage(err, 'Lỗi khi cập nhật vai trò.'))
    } finally {
      setUpdatingRole(false)
    }
  }

  // ── Xử lý bật / vô hiệu hóa tài khoản (S-28 AC3) ───────────────────────────
  const handleToggleStatus = async (user) => {
    const nextStatus = !user.is_active
    const actionText = nextStatus ? 'kích hoạt' : 'vô hiệu hóa'
    if (!window.confirm(`Bạn có chắc chắn muốn ${actionText} tài khoản "${user.email}"?`)) {
      return
    }

    setError(null)
    setNotice(null)
    try {
      const res = await toggleUserStatus(user.id, { is_active: nextStatus })
      setNotice(res.message)
      await loadUsers(userPagination.page)
    } catch (err) {
      setError(getErrorMessage(err, `Không thể ${actionText} tài khoản.`))
    }
  }

  // Thống kê nhanh người dùng
  const userStats = useMemo(() => {
    const total = userPagination.total || users.length
    const active = users.filter((u) => u.is_active && !u.deactivated_at).length
    const deactivated = users.filter((u) => !u.is_active || u.deactivated_at).length
    const staff = users.filter((u) => ['admin', 'organizer', 'ticket_checker', 'accountant'].includes(u.role)).length
    return { total, active, deactivated, staff }
  }, [users, userPagination])

  // Lọc sự kiện hiển thị
  const visibleEvents = useMemo(() => {
    const q = eventSearch.trim().toLowerCase()
    return events.filter(
      (e) =>
        (eventStatus === 'all' || e.status === eventStatus) &&
        (!q || e.title.toLowerCase().includes(q) || (e.organizer_name || '').toLowerCase().includes(q))
    )
  }, [events, eventSearch, eventStatus])

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 mb-2">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              QUẢN TRỊ VIÊN HỆ THỐNG
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Trung tâm Quản trị</h1>
            <p className="text-sm text-gray-500 mt-1">
              Quản lý tài khoản nội bộ, phân quyền vai trò tức thời và giám sát toàn bộ sự kiện.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/scanner"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              Mở cổng Soát vé (/scanner)
            </Link>
          </div>
        </div>

        {/* Thông báo Alert */}
        {error && (
          <div className="mb-6 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm p-4 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">✕</button>
          </div>
        )}
        {notice && (
          <div className="mb-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-4 flex items-center justify-between">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="text-emerald-500 hover:text-emerald-700">✕</button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 mb-8 gap-8">
          <button
            onClick={() => setActiveTab('users')}
            className={`pb-4 text-sm font-semibold transition-colors relative ${
              activeTab === 'users' ? 'text-pink-600' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Quản lý tài khoản & Phân quyền (S-28)
            {activeTab === 'users' && <span className="absolute bottom-0 inset-x-0 h-0.5 bg-pink-600 rounded-full" />}
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`pb-4 text-sm font-semibold transition-colors relative ${
              activeTab === 'logs' ? 'text-pink-600' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Nhật ký đổi vai trò (Audit Log NFR-1)
            {activeTab === 'logs' && <span className="absolute bottom-0 inset-x-0 h-0.5 bg-pink-600 rounded-full" />}
          </button>

          <button
            onClick={() => setActiveTab('events')}
            className={`pb-4 text-sm font-semibold transition-colors relative ${
              activeTab === 'events' ? 'text-pink-600' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Quản lý Sự kiện (Sprint 1-3)
            {activeTab === 'events' && <span className="absolute bottom-0 inset-x-0 h-0.5 bg-pink-600 rounded-full" />}
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: QUẢN LÝ TÀI KHOẢN VÀ PHÂN QUYỀN (S-28)                         */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Tổng tài khoản" value={userStats.total} accent="text-gray-900" subtext="Bao gồm mọi vai trò" />
              <StatCard label="Đang hoạt động" value={userStats.active} accent="text-emerald-600" subtext="Đã kích hoạt hợp lệ" />
              <StatCard label="Bị vô hiệu hóa" value={userStats.deactivated} accent="text-rose-600" subtext="Bị chặn đăng nhập (AC3)" />
              <StatCard label="Nhân viên nội bộ" value={userStats.staff} accent="text-purple-600" subtext="Soát vé, kế toán, BTC, admin" />
            </div>

            {/* Filter & Action Bar */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                  <input
                    type="search"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadUsers(1)}
                    placeholder="Tìm theo tên hoặc email…"
                    className="input-field max-w-xs text-sm"
                  />

                  <select
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value)}
                    className="input-field max-w-[180px] text-sm"
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>

                  <select
                    value={userStatusFilter}
                    onChange={(e) => setUserStatusFilter(e.target.value)}
                    className="input-field max-w-[160px] text-sm"
                  >
                    <option value="all">Tất cả trạng thái</option>
                    <option value="active">Đang hoạt động</option>
                    <option value="deactivated">Bị vô hiệu hóa</option>
                  </select>

                  <button
                    onClick={() => loadUsers(1)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors"
                  >
                    Lọc
                  </button>
                </div>

                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2.5 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-pink-200 transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Tạo tài khoản nhân viên
                </button>
              </div>
            </div>

            {/* Bảng danh sách người dùng */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-left border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3.5 font-semibold">Người dùng</th>
                      <th className="px-4 py-3.5 font-semibold">Vai trò hiện tại</th>
                      <th className="px-4 py-3.5 font-semibold">Trạng thái</th>
                      <th className="px-4 py-3.5 font-semibold">Ngày tạo</th>
                      <th className="px-4 py-3.5 font-semibold text-right">Thao tác quản trị</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {usersLoading ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                          Đang tải danh sách người dùng…
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                          Không tìm thấy người dùng nào phù hợp.
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => {
                        const isDeact = !u.is_active || !!u.deactivated_at
                        return (
                          <tr key={u.id} className="hover:bg-gray-50/80 transition-colors">
                            <td className="px-4 py-3.5">
                              <div className="font-semibold text-gray-900">{u.full_name || '—'}</div>
                              <div className="text-xs text-gray-500 font-mono mt-0.5">{u.email}</div>
                            </td>
                            <td className="px-4 py-3.5">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                  u.role === 'admin'
                                    ? 'bg-red-100 text-red-700 border-red-200'
                                    : u.role === 'organizer'
                                    ? 'bg-purple-100 text-purple-700 border-purple-200'
                                    : u.role === 'ticket_checker'
                                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                    : u.role === 'accountant'
                                    ? 'bg-amber-100 text-amber-700 border-amber-200'
                                    : 'bg-blue-100 text-blue-700 border-blue-200'
                                }`}
                              >
                                {u.role === 'admin'
                                  ? 'Quản trị (Admin)'
                                  : u.role === 'organizer'
                                  ? 'Ban tổ chức'
                                  : u.role === 'ticket_checker'
                                  ? 'Soát vé'
                                  : u.role === 'accountant'
                                  ? 'Kế toán'
                                  : 'Người mua (Buyer)'}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              {isDeact ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                                  Vô hiệu hóa (Khóa)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                  Đang hoạt động
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-xs text-gray-500">
                              {u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : '—'}
                            </td>
                            <td className="px-4 py-3.5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleOpenRoleModal(u)}
                                  className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 text-xs font-medium text-gray-700 transition-colors"
                                >
                                  Đổi vai trò
                                </button>
                                <button
                                  onClick={() => handleToggleStatus(u)}
                                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                                    isDeact
                                      ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                      : 'border-rose-200 text-rose-700 hover:bg-rose-50'
                                  }`}
                                >
                                  {isDeact ? 'Kích hoạt lại' : 'Vô hiệu hóa'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Phân trang */}
              {userPagination.totalPages > 1 && (
                <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                  <div>
                    Trang {userPagination.page} / {userPagination.totalPages} (Tổng {userPagination.total} tài khoản)
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={userPagination.page <= 1}
                      onClick={() => loadUsers(userPagination.page - 1)}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40"
                    >
                      Trước
                    </button>
                    <button
                      disabled={userPagination.page >= userPagination.totalPages}
                      onClick={() => loadUsers(userPagination.page + 1)}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40"
                    >
                      Sau
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: NHẬT KÝ ĐỔI VAI TRÒ (AUDIT LOG NFR-1)                           */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'logs' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden space-y-4 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Lịch sử thay đổi vai trò & Trạng thái tài khoản</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Ghi vết chi tiết mọi thao tác cấp quyền hoặc khóa tài khoản theo yêu cầu NFR-1.
                </p>
              </div>
              <button
                onClick={() => loadLogs(1)}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-700"
              >
                Làm mới
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-left border-b border-gray-100 text-xs">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Thời gian</th>
                    <th className="px-4 py-3 font-semibold">Người thao tác (Admin)</th>
                    <th className="px-4 py-3 font-semibold">Tài khoản đích</th>
                    <th className="px-4 py-3 font-semibold">Hành động</th>
                    <th className="px-4 py-3 font-semibold">Thay đổi vai trò</th>
                    <th className="px-4 py-3 font-semibold">Lý do / Ghi chú</th>
                    <th className="px-4 py-3 font-semibold">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {logsLoading ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Đang tải nhật ký…</td></tr>
                  ) : logs.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Chưa có bản ghi nhật ký nào.</td></tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {log.created_at ? new Date(log.created_at).toLocaleString('vi-VN') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900">{log.actor_name || 'Admin'}</div>
                          <div className="text-[11px] text-gray-500">{log.actor_email || '—'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900">{log.target_name || 'Người dùng'}</div>
                          <div className="text-[11px] text-gray-500">{log.target_email || '—'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${
                            log.action === 'CREATE_STAFF'
                              ? 'bg-purple-100 text-purple-700'
                              : log.action === 'ROLE_CHANGE'
                              ? 'bg-blue-100 text-blue-700'
                              : log.action === 'DEACTIVATE_USER'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {log.old_role ? (
                            <span className="font-mono text-gray-600">
                              {log.old_role} → <strong className="text-gray-900">{log.new_role}</strong>
                            </span>
                          ) : (
                            <span className="font-mono text-purple-700 font-semibold">{log.new_role}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{log.reason || '—'}</td>
                        <td className="px-4 py-3 font-mono text-gray-400 text-[11px]">{log.ip_address || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Phân trang Logs */}
            {logsPagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <div>
                  Trang {logsPagination.page} / {logsPagination.totalPages} (Tổng {logsPagination.total} bản ghi)
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={logsPagination.page <= 1}
                    onClick={() => loadLogs(logsPagination.page - 1)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40"
                  >
                    Trước
                  </button>
                  <button
                    disabled={logsPagination.page >= logsPagination.totalPages}
                    onClick={() => loadLogs(logsPagination.page + 1)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40"
                  >
                    Sau
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 3: QUẢN LÝ SỰ KIỆN (LEGACY ADMIN VIEW)                             */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'events' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 pb-4">
              <input
                type="search"
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                placeholder="Tìm theo tên sự kiện hoặc organizer…"
                className="input-field max-w-sm text-sm"
              />
              <div className="flex gap-2">
                {EVENT_STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setEventStatus(f.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                      eventStatus === f.value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500 bg-gray-50 text-xs">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Sự kiện</th>
                    <th className="px-4 py-3 font-semibold">Organizer</th>
                    <th className="px-4 py-3 font-semibold">Trạng thái</th>
                    <th className="px-4 py-3 font-semibold">Suất diễn</th>
                    <th className="px-4 py-3 font-semibold">Giá từ</th>
                    <th className="px-4 py-3 font-semibold text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {eventsLoading ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Đang tải sự kiện…</td></tr>
                  ) : visibleEvents.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Không có sự kiện nào.</td></tr>
                  ) : (
                    visibleEvents.map((event) => (
                      <tr key={event.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900">{event.title}</div>
                          <div className="text-[11px] text-gray-500">{event.category} · {event.venue}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{event.organizer_name || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            event.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {event.status === 'published' ? 'Công khai' : 'Nháp'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{event.showtime_count} suất diễn</td>
                        <td className="px-4 py-3 text-gray-700 font-semibold">{formatPrice(event.min_price)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            {event.status === 'published' && (
                              <Link to={`/events/${event.id}`} className="px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50">
                                Xem
                              </Link>
                            )}
                            <button
                              onClick={async () => {
                                await updateEvent(event.id, { status: event.status === 'published' ? 'draft' : 'published' })
                                loadEvents()
                              }}
                              className="px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50"
                            >
                              {event.status === 'published' ? 'Ẩn' : 'Hiện'}
                            </button>
                            <button
                              onClick={async () => {
                                if (window.confirm(`Xóa sự kiện "${event.title}"?`)) {
                                  await deleteEvent(event.id)
                                  loadEvents()
                                }
                              }}
                              className="px-2.5 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                            >
                              Xóa
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 1: TẠO TÀI KHOẢN NHÂN VIÊN MỚI (S-28)                           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Tạo tài khoản nhân viên mới</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Email đăng nhập <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="nhanvien@eventticketing.vn"
                  className="input-field text-sm w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Họ và tên nhân viên
                </label>
                <input
                  type="text"
                  value={createForm.full_name}
                  onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                  placeholder="Nguyễn Văn A"
                  className="input-field text-sm w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Mật khẩu ban đầu <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="Tối thiểu 6 ký tự (Argon2id băm an toàn)"
                  className="input-field text-sm w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Vai trò phân công <span className="text-red-500">*</span>
                </label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                  className="input-field text-sm w-full"
                >
                  <option value="ticket_checker">Soát vé (Ticket Checker - chỉ thấy màn hình soát vé)</option>
                  <option value="accountant">Kế toán (Accountant - đối soát doanh thu)</option>
                  <option value="organizer">Ban tổ chức (Organizer - quản lý sự kiện/sơ đồ ghế)</option>
                  <option value="admin">Quản trị viên (Admin - toàn quyền)</option>
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  Tài khoản nhân viên được cấp sẽ tự động kích hoạt để đăng nhập được ngay.
                </p>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-md shadow-pink-200"
                >
                  {creating ? 'Đang tạo…' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 2: THAY ĐỔI VAI TRÒ NGƯỜI DÙNG (S-28 AC2)                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {roleModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Thay đổi vai trò người dùng</h3>
              <button
                onClick={() => setRoleModalUser(null)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitRoleChange} className="mt-4 space-y-4">
              <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 text-xs text-gray-600">
                <div>Người dùng: <strong className="text-gray-900">{roleModalUser.full_name || roleModalUser.email}</strong></div>
                <div>Email: <strong className="text-gray-900">{roleModalUser.email}</strong></div>
                <div>Vai trò hiện tại: <span className="font-semibold text-pink-600">{roleModalUser.role}</span></div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Chọn vai trò mới <span className="text-red-500">*</span>
                </label>
                <select
                  value={newRoleSelect}
                  onChange={(e) => setNewRoleSelect(e.target.value)}
                  className="input-field text-sm w-full"
                >
                  <option value="ticket_checker">Soát vé (Ticket Checker)</option>
                  <option value="accountant">Kế toán (Accountant)</option>
                  <option value="organizer">Ban tổ chức (Organizer)</option>
                  <option value="buyer">Người mua (Buyer)</option>
                  <option value="admin">Quản trị viên (Admin)</option>
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  ⚡ <strong>S-28 AC2:</strong> Quyền mới sẽ có hiệu lực ngay lập tức trong lệnh gọi API tiếp theo của người dùng mà không cần họ đăng xuất!
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Lý do thay đổi (ghi vào audit log NFR-1)
                </label>
                <input
                  type="text"
                  value={roleChangeReason}
                  onChange={(e) => setRoleChangeReason(e.target.value)}
                  placeholder="VD: Điều chuyển nhân sự phục vụ sự kiện"
                  className="input-field text-sm w-full"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setRoleModalUser(null)}
                  className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={updatingRole}
                  className="px-5 py-2 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-md shadow-pink-200"
                >
                  {updatingRole ? 'Đang cập nhật…' : 'Lưu vai trò mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </div>
  )
}
