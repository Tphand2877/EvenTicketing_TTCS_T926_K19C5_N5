import apiClient from './apiClient'

/**
 * SCRUM-223 [S-27] - Ticket Service Frontend
 * Lấy danh sách vé điện tử kèm mã QR và yêu cầu gửi lại email vé
 */

export const getOrderTickets = async (orderId) => {
  const { data } = await apiClient.get(`/orders/${orderId}/tickets`)
  return data?.data || data
}

export const resendTicketEmail = async (orderId, email = null) => {
  const payload = email ? { email } : {}
  const { data } = await apiClient.post(`/orders/${orderId}/send-ticket-email`, payload)
  return data
}
