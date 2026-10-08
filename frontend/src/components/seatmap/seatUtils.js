export const SEATS_PER_ROW = 10

/** Tên hàng ghế: A, B, ..., Z, A1, B1, ... */
export const rowLabel = (index) =>
  String.fromCharCode(65 + (index % 26)) + (index >= 26 ? Math.floor(index / 26) : '')

/** Tên ghế: nhận object { row, number } hoặc số nguyên index (fallback) */
export const seatName = (seat) => {
  if (typeof seat === 'object' && seat !== null) {
    return `${seat.row || ''}${seat.number || ''}`
  }
  if (typeof seat === 'number') {
    return `${rowLabel(Math.floor(seat / SEATS_PER_ROW))}${(seat % SEATS_PER_ROW) + 1}`
  }
  return String(seat)
}
