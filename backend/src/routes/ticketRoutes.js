const { createSecureRouter } = require('../middleware/secureRoute');
const { createTicketController } = require('../controllers/ticketController');
const { createTicketService } = require('../services/ticketService');

/** S-25: người mua xem vé điện tử (kèm QR có chữ ký S-26) của mình. */
const createTicketRouter = ({ ticketService = createTicketService() } = {}) => {
  const router = createSecureRouter();
  const controller = createTicketController({ ticketService });
  router.get('/', { authenticated: true }, controller.listMine);
  router.get('/orders/:orderId', { authenticated: true }, controller.listForOrder);
  return router;
};

module.exports = { createTicketRouter, ticketRouter: createTicketRouter() };
