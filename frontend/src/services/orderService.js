import apiClient from './apiClient'

// T-51: Lấy trạng thái thanh toán từ Backend T-50.
export const getOrderStatus = async (orderId, options = {}) => {
  if (!orderId) {
    throw new Error('Không tìm thấy mã đơn hàng.')
  }

  const response = await apiClient.get(
    `/orders/${encodeURIComponent(orderId)}/status`,
    { signal: options.signal }
  )

  return response.data
}
