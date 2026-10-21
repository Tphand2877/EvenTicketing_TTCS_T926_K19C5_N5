const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const {
  getOrderTicketsController,
  sendTicketEmailController,
} = require('../controllers/orderTicketController');

const router = express.Router();

/**
 * SCRUM-223 [S-27] - Ticket & Email Routes
 */

// Lấy danh sách vé kèm mã QR của đơn hàng
router.get('/:orderId/tickets', authenticate, getOrderTicketsController);

// Gửi / Gửi lại email vé điện tử kèm mã QR
router.post('/:orderId/send-ticket-email', authenticate, sendTicketEmailController);
router.post('/:orderId/resend-ticket', authenticate, sendTicketEmailController);

module.exports = router;
