import apiClient from './apiClient'

/**
 * Tra cứu trạng thái thanh toán từ server (S-18 / S-22)
 * @param {string} orderId
 * @param {Object} [options]
 */
export const getPaymentStatus = async (orderId, options = {}) => {
  const { data } = await apiClient.get(`/payments/orders/${orderId}`, options)
  return data?.data?.payment || data?.payment || data
}
