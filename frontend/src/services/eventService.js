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

// ── Seat hold – SCRUM-84 ─────────────────────────────────────────────────────

export const getAvailability = async (showtimeId) => {
  const { data } = await apiClient.get(`/showtimes/${showtimeId}/availability`)
  return data.data
}

export const holdSeats = async (showtimeId, quantity) => {
  const { data } = await apiClient.post(`/showtimes/${showtimeId}/holds`, { quantity })
  return data.data.hold
}

export const releaseHold = async (holdId) => {
  await apiClient.delete(`/showtimes/holds/${holdId}`)
}
// SCRUM-175 / T-26 – huỷ MỘT ghế đang giữ (API của T-25).
// TODO: đối chiếu route và format response với T-25 của Thái.
export const releaseSeat = async (holdId, seat) => {
  const { data } = await apiClient.delete(`/showtimes/holds/${holdId}/seats/${seat}`)
  return data?.data?.hold ?? null
}