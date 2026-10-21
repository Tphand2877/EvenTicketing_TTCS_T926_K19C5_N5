const { createSecureRouter } = require('../middleware/secureRoute');
const { createTicketController } = require('../controllers/ticketController');
const { createTicketService } = require('../services/ticketService');
const { createTicketEmailDispatcher } = require('../services/ticketNotificationService');

/** S-25: người mua xem vé điện tử (kèm QR có chữ ký S-26) của mình; S-27: gửi lại vé qua email. */
const createTicketRouter = ({ ticketService = createTicketService(), ticketEmails = createTicketEmailDispatcher({ ticketService }) } = {}) => {
  const router = createSecureRouter();
  const controller = createTicketController({ ticketService, ticketEmails });
  router.get('/', { authenticated: true }, controller.listMine);
  router.get('/orders/:orderId', { authenticated: true }, controller.listForOrder);
  router.post('/orders/:orderId/email', { authenticated: true }, controller.emailOrderTickets); // S-27
  return router;
};

module.exports = { createTicketRouter, ticketRouter: createTicketRouter() };
