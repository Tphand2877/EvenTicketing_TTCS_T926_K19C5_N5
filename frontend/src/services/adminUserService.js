import apiClient from './apiClient'

// S-28: admin quản lý tài khoản nhân viên và vai trò

export const getRoles = async () => {
  const { data } = await apiClient.get('/admin/roles')
  return data.data.roles
}

/** @param {{ role?: string, q?: string, page?: number }} params */
export const getUsers = async (params = {}) => {
  const { data } = await apiClient.get('/admin/users', { params })
  return data.data
}

export const createUser = async (user) => {
  const { data } = await apiClient.post('/admin/users', user)
  return data.data.user
}

/** @param {{ role?: string, isActive?: boolean, fullName?: string }} changes */
export const updateUser = async (id, changes) => {
  const { data } = await apiClient.patch(`/admin/users/${id}`, changes)
  return data.data.user
}
