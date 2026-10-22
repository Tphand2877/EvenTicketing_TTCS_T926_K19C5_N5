import apiClient from './apiClient'

/**
 * S-28: Admin API Service
 * Quản trị người dùng, gán vai trò, kiểm soát trạng thái tài khoản và audit log
 */

/**
 * Lấy danh sách người dùng kèm phân trang và bộ lọc
 */
export const getUsers = async ({ page = 1, limit = 20, search = '', role = '', status = '' } = {}) => {
  const { data } = await apiClient.get('/admin/users', {
    params: { page, limit, search, role, status },
  })
  return data?.data || { users: [], pagination: {} }
}

/**
 * Lấy danh sách các vai trò hệ thống
 */
export const getRoles = async () => {
  const { data } = await apiClient.get('/admin/roles')
  return data?.data || []
}

/**
 * Quản trị viên tạo tài khoản nhân viên (soát vé, kế toán, ban tổ chức)
 */
export const createStaffUser = async ({ email, password, full_name, role }) => {
  const { data } = await apiClient.post('/admin/users', {
    email,
    password,
    full_name,
    role,
  })
  return data
}

/**
 * Thay đổi vai trò người dùng (S-28 AC2)
 */
export const updateUserRole = async (userId, { role, reason }) => {
  const { data } = await apiClient.patch(`/admin/users/${userId}/role`, {
    role,
    reason,
  })
  return data
}

/**
 * Kích hoạt / Vô hiệu hóa tài khoản (S-28 AC3)
 */
export const toggleUserStatus = async (userId, { is_active, reason }) => {
  const { data } = await apiClient.patch(`/admin/users/${userId}/status`, {
    is_active,
    reason,
  })
  return data
}

/**
 * Lấy nhật ký thay đổi vai trò (S-28 NFR-1)
 */
export const getRoleChangeLogs = async ({ page = 1, limit = 20 } = {}) => {
  const { data } = await apiClient.get('/admin/role-change-logs', {
    params: { page, limit },
  })
  return data?.data || { logs: [], pagination: {} }
}

/**
 * Xác thực vé tại cửa (S-28 AC1 dành cho ticket_checker và admin)
 */
export const verifyTicket = async (code) => {
  const { data } = await apiClient.post('/tickets/verify', { code })
  return data
}

/**
 * Lấy danh sách lượt quét vé gần nhất tại cửa
 */
export const getRecentScans = async () => {
  const { data } = await apiClient.get('/tickets/recent-scans')
  return data?.data || { recentScans: [], totalCheckedIn: 0 }
}
