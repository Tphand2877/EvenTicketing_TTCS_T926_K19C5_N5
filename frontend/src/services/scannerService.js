import apiClient from './apiClient'

// S-29 / S-30 / S-31: màn soát vé

/** Suất có thể soát (kèm cổng của sự kiện và số vé đã vào) */
export const getScannerShowtimes = async () => {
  const { data } = await apiClient.get('/scanner/showtimes')
  return data.data.showtimes
}

/** Quét một mã QR tại suất + cổng đã chọn. Trả { accepted, code, message, ticket, admission?, firstAdmission? } */
export const scanTicket = async ({ qrCode, showtimeId, gate }) => {
  const { data } = await apiClient.post('/scanner/scan', { qrCode, showtimeId, gate })
  return data.data.result
}

/** S-31: trưởng ca cho vào có ghi chú. requestId giữ nguyên khi gửi lại cùng một lần xác nhận. */
export const admitWithNote = async ({ qrCode, showtimeId, gate, reason, requestId }) => {
  const { data } = await apiClient.post('/scanner/admit-with-note', { qrCode, showtimeId, gate, reason, requestId })
  return data.data.result
}

/** S-29: organizer khai báo cổng soát vé của sự kiện */
export const getEventGates = async (eventId) => {
  const { data } = await apiClient.get(`/events/${eventId}/gates`)
  return data.data.gates
}

export const saveEventGates = async (eventId, gates) => {
  const { data } = await apiClient.put(`/events/${eventId}/gates`, { gates })
  return data.data.gates
}
