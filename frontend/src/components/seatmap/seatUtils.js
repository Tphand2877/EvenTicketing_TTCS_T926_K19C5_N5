export const SEATS_PER_ROW = 10

/** Tên hàng ghế: A, B, ..., Z, A1, B1, ... */
export const rowLabel = (index) =>
  String.fromCharCode(65 + (index % 26)) + (index >= 26 ? Math.floor(index / 26) : '')

/** Tên ghế theo chỉ số, ví dụ 0 -> "A1", 12 -> "B3" */
export const seatName = (seat) => `${rowLabel(Math.floor(seat / SEATS_PER_ROW))}${(seat % SEATS_PER_ROW) + 1}`
