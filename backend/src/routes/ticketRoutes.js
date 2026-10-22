/**
 * S-28 AC1 / Sprint 4 Goal: Ticket Routes cho soát vé tại cửa
 * Quyền: admin, ticket_checker
 */

const { createSecureRouter } = require('../middleware/secureRoute');
const ticketScannerController = require('../controllers/ticketScannerController');

const router = createSecureRouter();

router.post('/verify', { roles: ['admin', 'ticket_checker'] }, ticketScannerController.verifyTicket);
router.get('/recent-scans', { roles: ['admin', 'ticket_checker'] }, ticketScannerController.getRecentScans);

module.exports = router;
