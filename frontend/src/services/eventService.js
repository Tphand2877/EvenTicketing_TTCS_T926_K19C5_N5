import apiClient from './apiClient'

// ── Buyer (public) – SCRUM-80 ────────────────────────────────────────────────

/**
 * Fetch paginated event list
 * @param {{ q?: string, category?: string, page?: number, limit?: number }} params
 */
export const getEvents = async (params = {}) => {
  const { data } = await apiClient.get('/events', { params })
  return data.data
}

/**
 * Fetch single event by ID (kèm danh sách suất diễn)
 */
export const getEvent = async (id) => {
  const { data } = await apiClient.get(`/events/${id}`)
  return data.data
}

// ── Organizer – SCRUM-80 ─────────────────────────────────────────────────────

export const getMyEvents = async () => {
  const { data } = await apiClient.get('/events/mine')
  return data.data.events
}

export const createEvent = async (event) => {
  const { data } = await apiClient.post('/events', event)
  return data.data.event
}

export const updateEvent = async (id, changes) => {
  const { data } = await apiClient.patch(`/events/${id}`, changes)
  return data.data.event
}

export const deleteEvent = async (id) => {
  await apiClient.delete(`/events/${id}`)
}

export const createShowtime = async (eventId, showtime) => {
  const { data } = await apiClient.post(`/events/${eventId}/showtimes`, showtime)
  return data.data.showtime
}

// ── Seat hold & Seat map – SCRUM-84, SCRUM-165 (T-19) ────────────────────────

export const getAvailability = async (showtimeId) => {
  const { data } = await apiClient.get(`/showtimes/${showtimeId}/availability`)
  return data.data
}

/**
 * SCRUM-165 (T-19): Truy vấn toàn bộ trạng thái ghế theo suất diễn trong một lần gọi
 * @param {number|string} showtimeId
 * @returns {Promise<{ showtime_id: number, seats: Array<{ id: number, row: string, number: number, category_id?: number, category?: string, price?: number, status: 'available'|'held'|'sold' }> }>}
 */
export const getSeatMap = async (showtimeId) => {
  const { data } = await apiClient.get(`/showtimes/${showtimeId}/seats`)
  return data.data
}

export const holdSeats = async (showtimeId, quantity) => {
  const { data } = await apiClient.post(`/showtimes/${showtimeId}/holds`, { quantity })
  return data.data.hold
}

export const releaseHold = async (holdId) => {
  await apiClient.delete(`/showtimes/holds/${holdId}`)
}
 HEAD
// SCRUM-175 / T-26 – huỷ MỘT ghế đang giữ (API của T-25).
// TODO: đối chiếu route và format response với T-25 của Thái.
export const releaseSeat = async (holdId, seat) => {
  const { data } = await apiClient.delete(`/showtimes/holds/${holdId}/seats/${seat}`)
  return data?.data?.hold ?? null
}


// ── Public showtimes – SCRUM-162 (T-17, T-18) ───────────────────────────────

/**
 * SCRUM-162 (T-17): Lấy danh sách suất diễn đang mở bán có phân trang cursor
 * @param {{ limit?: number, cursor?: string }} params
 */
export const getPublicShowtimes = async (params = {}) => {
  const { data } = await apiClient.get('/showtimes', { params })
  return data.data
}

/**
 * SCRUM-162 (T-17 / T-18): Lấy chi tiết suất diễn công khai
 * @param {number|string} id
 * @returns {Promise<{ showtime: object, on_sale: boolean }>}
 */
export const getPublicShowtime = async (id) => {
  const { data } = await apiClient.get(`/showtimes/${id}`)
  return data.data
}

// ── Organizer: sơ đồ ghế (S-05) và mở bán / đóng bán (S-07) ────────────────────

/** Mọi suất của một sự kiện (kể cả nháp) kèm seat_count, category_count */
export const getEventShowtimes = async (eventId) => {
  const { data } = await apiClient.get(`/events/${eventId}/showtimes`)
  return data.data.showtimes
}

/** Nạp/thay sơ đồ ghế: seats = [{ row, number, category }] */
export const importSeatMap = async (showtimeId, seats) => {
  const { data } = await apiClient.put(`/showtimes/${showtimeId}/seat-map`, { seats })
  return data
}

export const openSales = async (showtimeId) => {
  const { data } = await apiClient.post(`/showtimes/${showtimeId}/open-sales`)
  return data
}

export const closeSales = async (showtimeId) => {
  const { data } = await apiClient.post(`/showtimes/${showtimeId}/close-sales`)
  return data
}

 main
