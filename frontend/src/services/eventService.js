import apiClient from './apiClient'

/**
 * Fetch paginated event list
 */
export const getEvents = async (params = {}) => {
  const { data } = await apiClient.get('/events', { params })
  return data
}

/**
 * Fetch single event by ID
 */
export const getEvent = async (id) => {
  const { data } = await apiClient.get(`/events/${id}`)
  return data
}
