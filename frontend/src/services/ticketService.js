import apiClient from './apiClient'

// S-25: vé điện tử của người mua, mỗi vé kèm QR có chữ ký (S-26) do server tạo

/** Tất cả vé của tài khoản đang đăng nhập */
export const getMyTickets = async () => {
  const { data } = await apiClient.get('/tickets')
  return data.data.tickets
}

/** Vé của một đơn đã thanh toán (409 ORDER_NOT_PAID nếu đơn chưa thanh toán) */
export const getOrderTickets = async (orderId) => {
  const { data } = await apiClient.get(`/tickets/orders/${encodeURIComponent(orderId)}`)
  return data.data.tickets
}

/** S-27: gửi (lại) vé của một đơn đã thanh toán về email của tài khoản */
export const sendTicketEmail = async (orderId) => {
  const { data } = await apiClient.post(`/tickets/orders/${encodeURIComponent(orderId)}/email`)
  return data.message
}
