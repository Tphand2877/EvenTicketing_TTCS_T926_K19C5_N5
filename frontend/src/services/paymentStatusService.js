import apiClient from './apiClient'

/**
 * S-22 / T-51: trạng thái thanh toán của đơn do SERVER xác nhận (S-18 / T-41, T-42).
 * Trả về { status, orderId, retryAfterSeconds? } với status thuộc:
 * paid | failed | processing | not_started | ready | expired | cancelled | needs_review
 */
export const getPaymentStatus = async (orderId, { signal } = {}) => {
  if (!orderId) throw new Error('Không tìm thấy mã đơn hàng.')
  const { data } = await apiClient.get(`/payments/orders/${encodeURIComponent(orderId)}`, { signal })
  return data.data.payment
}
