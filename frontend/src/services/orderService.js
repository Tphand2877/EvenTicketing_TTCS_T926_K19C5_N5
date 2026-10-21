import apiClient from './apiClient'

/**
 * SCRUM-220 [S-32]: Lấy danh sách lịch sử đơn hàng của người dùng (phân trang, mới nhất trước)
 * @param {Object} options
 * @param {number} [options.page=1]
 * @param {number} [options.limit=10]
 * @param {string} [options.status]
 * @returns {Promise<Object>} { success: true, data: { orders, pagination } }
 */
export const getMyOrders = async ({ page = 1, limit = 10, status = '' } = {}) => {
  const params = { page, limit }
  if (status && status !== 'all') {
    params.status = status
  }
  const response = await apiClient.get('/orders', { params })
  return response.data
}

/**
 * SCRUM-220 [S-32] (AC2): Lấy chi tiết đơn hàng theo mã đơn
 * @param {string} orderId
 * @returns {Promise<Object>} { success: true, data: order }
 */
export const getOrderDetail = async (orderId) => {
  const response = await apiClient.get(`/orders/${orderId}`)
  return response.data
}

export default {
  getMyOrders,
  getOrderDetail,
}
