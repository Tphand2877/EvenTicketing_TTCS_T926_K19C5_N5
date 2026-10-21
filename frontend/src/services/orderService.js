import apiClient from './apiClient'

/**
 * T-38 / S-17: Tạo đơn hàng từ hold
 * @param {string} holdId
 */
export const createOrder = async (holdId) => {
  const { data } = await apiClient.post('/payments/orders', { holdId })
  return data.data.order
}

/**
 * T-39 / S-17: Lấy tóm tắt chi tiết đơn hàng
 * @param {string} orderId
 */
export const getOrderSummary = async (orderId) => {
  const { data } = await apiClient.get(`/payments/orders/${orderId}/summary`)
  return data.data.order
}

/**
 * Thanh toán đơn hàng qua cổng (S-18 / T-41)
 * @param {string} orderId
 */
export const initiatePayment = async (orderId) => {
  const { data } = await apiClient.post(`/payments/orders/${orderId}`)
  return data.data.payment
}
