const db = require('../config/database');

/** S-25: vé đã phát kèm thông tin hiển thị (sự kiện, suất, ghế, hạng, giá đã chụp lúc đặt). */
const ticketDetails = (database) => database('tickets as ticket')
  .join('orders as ord', 'ord.id', 'ticket.order_id')
  .join('order_items as item', 'item.id', 'ticket.order_item_id')
  .join('seats as seat', 'seat.id', 'ticket.seat_id')
  .join('showtimes as showtime', 'showtime.id', 'ticket.showtime_id')
  .join('events as event', 'event.id', 'showtime.event_id')
  .select({
    id: 'ticket.id',
    status: 'ticket.status',
    issuedAt: 'ticket.issued_at',
    orderId: 'ticket.order_id',
    orderStatus: 'ord.status',
    userId: 'ticket.user_id',
    seatId: 'ticket.seat_id',
    rowLabel: 'seat.row_label',
    seatNumber: 'seat.seat_number',
    categoryName: 'item.category_name',
    unitPrice: 'item.unit_price',
    currency: 'ord.currency',
    showtimeId: 'ticket.showtime_id',
    startsAt: 'showtime.starts_at',
    eventId: 'event.id',
    eventTitle: 'event.title',
    venue: 'event.venue',
  });

const createTicketModel = (database = db) => ({
  findByUser: (userId) => ticketDetails(database)
    .where('ticket.user_id', userId)
    .orderBy([{ column: 'showtime.starts_at', order: 'asc' }, 'seat.row_label', 'seat.seat_number']),

  findByOrder: (orderId) => ticketDetails(database)
    .where('ticket.order_id', orderId)
    .orderBy(['seat.row_label', 'seat.seat_number']),

  findOrder: (orderId) => database('orders').select('id', 'user_id', 'status').where({ id: orderId }).first(),
});

module.exports = { createTicketModel, ticketDetails };
