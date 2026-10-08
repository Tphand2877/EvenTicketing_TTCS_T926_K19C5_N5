/**
 * SCRUM-80 - Events & Showtimes routes
 * SCRUM-84 (spike) - Seat hold routes
 * S-05 / T-12 - Seat map import
 * S-07 / T-15 - Open / close sales
 *
 * Dùng createSecureRouter: route nào không khai báo policy sẽ bị từ chối (deny by default).
 */

const { createSecureRouter } = require('../middleware/secureRoute');
const {
  listEvents,
  getEvent,
  listMyEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  createShowtime,
  updateShowtime,
  deleteShowtime,
  getAvailability,
  holdSeats,
  releaseHold,
  importSeatMap,
  listEventShowtimes,
  openSales,
  closeSales,
  getStatusLog,
} = require('../controllers/eventController');
const {
  validateEvent,
  validateShowtime,
  validateSeatHold,
  validateSeatMap,
} = require('../middleware/validateMiddleware');

const MANAGERS = { roles: ['organizer', 'admin'] };

// ─── /api/events ─────────────────────────────────────────────────────────────
const eventRouter = createSecureRouter();

eventRouter.get('/', { public: true }, listEvents);
// Khai báo /mine TRƯỚC /:id để không bị hiểu nhầm "mine" là id
eventRouter.get('/mine', MANAGERS, listMyEvents);
eventRouter.get('/:id', { public: true }, getEvent);
eventRouter.post('/', MANAGERS, validateEvent(), createEvent);
eventRouter.patch('/:id', MANAGERS, validateEvent({ partial: true }), updateEvent);
eventRouter.delete('/:id', MANAGERS, deleteEvent);
eventRouter.post('/:id/showtimes', MANAGERS, validateShowtime(), createShowtime);
eventRouter.get('/:id/showtimes', MANAGERS, listEventShowtimes);

// ─── /api/showtimes ──────────────────────────────────────────────────────────
const showtimeRouter = createSecureRouter();
const { listOnSale, getPublicShowtime, getSeatMap } = require('../controllers/publicShowtimeController');

showtimeRouter.get('/', { public: true }, listOnSale);
showtimeRouter.delete('/holds/:holdId', { authenticated: true }, releaseHold);
showtimeRouter.get('/:id/seats', { public: true }, getSeatMap);
showtimeRouter.get('/:id', { public: true }, getPublicShowtime);
showtimeRouter.get('/:id/availability', { public: true }, getAvailability);
showtimeRouter.post('/:id/holds', { authenticated: true }, validateSeatHold, holdSeats);
showtimeRouter.put('/:id/seat-map', MANAGERS, validateSeatMap, importSeatMap);
showtimeRouter.post('/:id/open-sales', MANAGERS, openSales);
showtimeRouter.post('/:id/close-sales', MANAGERS, closeSales);
showtimeRouter.get('/:id/status-log', MANAGERS, getStatusLog);
showtimeRouter.patch('/:id', MANAGERS, validateShowtime({ partial: true }), updateShowtime);
showtimeRouter.delete('/:id', MANAGERS, deleteShowtime);

module.exports = { eventRouter, showtimeRouter };
