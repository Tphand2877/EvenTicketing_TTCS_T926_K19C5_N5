import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'
import { formatDateTime, getErrorMessage } from '../components/event/eventFormat'
import { useAuth } from '../context/AuthContext'
import { createUser, getRoles, getUsers, updateUser } from '../services/adminUserService'
import { ROLE_LABELS } from '../components/common/roleLabels'

const EMPTY_FORM = { email: '', fullName: '', password: '', role: 'staff' }

function CreateUserForm({ roles, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const setField = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) return setError('Mật khẩu phải có ít nhất 8 ký tự.')
    setSaving(true)
    try {
      const user = await createUser(form)
      setForm(EMPTY_FORM)
      onCreated(user)
    } catch (err) {
      setError(getErrorMessage(err, 'Không tạo được tài khoản.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-5 space-y-4" aria-label="Tạo tài khoản">
      <h2 className="text-lg font-semibold text-gray-900">Tạo tài khoản nhân viên</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <input name="fullName" value={form.fullName} onChange={setField} placeholder="Họ tên" className="input-field" required />
        <input name="email" type="email" value={form.email} onChange={setField} placeholder="Email" className="input-field" required />
        <input name="password" type="password" value={form.password} onChange={setField} placeholder="Mật khẩu tạm (≥ 8 ký tự)"
          className="input-field" autoComplete="new-password" required />
        <select name="role" value={form.role} onChange={setField} className="input-field" aria-label="Vai trò">
          {roles.map((r) => <option key={r.name} value={r.name}>{ROLE_LABELS[r.name] || r.name}</option>)}
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">Tài khoản dùng được ngay. Gửi mật khẩu tạm cho nhân viên qua kênh riêng.</p>
        <button type="submit" disabled={saving} className="btn-primary !w-auto px-5">{saving ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
      </div>
    </form>
  )
}

/** S-28: admin tạo tài khoản nhân viên, gán vai trò, khoá/mở tài khoản. */
export default function AdminUsersPage() {
  const { user: me } = useAuth()
  const [roles, setRoles] = useState([])
  const [result, setResult] = useState({ users: [], total: 0 })
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setResult(await getUsers({ role: filter || undefined, q: search || undefined }))
    } catch (err) {
      setError(getErrorMessage(err, 'Không tải được danh sách tài khoản.'))
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => { getRoles().then(setRoles).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])

  const change = async (target, changes, text) => {
    setError('')
    setNotice('')
    try {
      await updateUser(target.id, changes)
      setNotice(text)
      await load()
    } catch (err) {
      setError(getErrorMessage(err, 'Không cập nhật được tài khoản.'))
    }
  }

  const myId = me?.id

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Tài khoản & vai trò</h1>
          <Link to="/admin" className="text-sm text-pink-600 hover:underline">← Quản trị sự kiện</Link>
        </div>

        <CreateUserForm roles={roles} onCreated={(u) => { setNotice(`Đã tạo tài khoản ${u.email} (${ROLE_LABELS[u.role] || u.role}).`); load() }} />

        {error && <div className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}
        {notice && <div className="rounded-xl bg-green-50 text-green-700 text-sm px-4 py-3">{notice}</div>}

        <div className="bg-white rounded-2xl shadow-sm">
          <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-100">
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên hoặc email…" className="input-field max-w-sm" />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="input-field max-w-xs" aria-label="Lọc vai trò">
              <option value="">Tất cả vai trò</option>
              {roles.map((r) => <option key={r.name} value={r.name}>{ROLE_LABELS[r.name] || r.name}</option>)}
            </select>
            <span className="text-sm text-gray-500 ml-auto">{result.total} tài khoản</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-medium">Tài khoản</th>
                  <th className="px-4 py-3 font-medium">Vai trò</th>
                  <th className="px-4 py-3 font-medium">Trạng thái</th>
                  <th className="px-4 py-3 font-medium">Ngày tạo</th>
                  <th className="px-4 py-3 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Đang tải…</td></tr>}
                {!loading && result.users.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Không có tài khoản nào.</td></tr>
                )}
                {!loading && result.users.map((u) => {
                  const isMe = u.id === myId
                  return (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{u.fullName || '—'}{isMe && ' (bạn)'}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <select value={u.role} disabled={isMe} aria-label={`Vai trò của ${u.email}`}
                          onChange={(e) => change(u, { role: e.target.value }, `Đã đổi vai trò của ${u.email} thành ${ROLE_LABELS[e.target.value] || e.target.value}. Áp dụng từ lần đăng nhập tiếp theo.`)}
                          className="input-field !py-1.5">
                          {roles.map((r) => <option key={r.name} value={r.name}>{ROLE_LABELS[r.name] || r.name}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                          {u.isActive ? 'Đang hoạt động' : 'Đã khoá'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatDateTime(u.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {!isMe && (
                          <button onClick={() => change(u, { isActive: !u.isActive }, `${u.isActive ? 'Đã khoá' : 'Đã mở khoá'} ${u.email}.`)}
                            className={`px-3 py-1.5 rounded-lg border ${u.isActive ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                            {u.isActive ? 'Khoá' : 'Mở khoá'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
