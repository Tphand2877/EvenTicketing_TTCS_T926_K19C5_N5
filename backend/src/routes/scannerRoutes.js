const db = require('../config/database');
const { createSecureRouter } = require('../middleware/secureRoute');
const { createGateScanController, sendError } = require('../controllers/gateScanController');
const { SCANNER_ROLES, createGateScanService } = require('../services/gateScanService');

/** S-29 / S-30 / S-31: màn soát vé. Vai trò được kiểm lại trong DB mỗi lần quét. */
const createScannerRouter = ({ service = createGateScanService() } = {}) => {
  const router = createSecureRouter();
  const controller = createGateScanController({ service });
  const SCANNERS = { roles: SCANNER_ROLES };
  router.get('/showtimes', SCANNERS, controller.listShowtimes);
  router.post('/scan', SCANNERS, controller.scan);
  router.post('/admit-with-note', SCANNERS, controller.admitWithNote);
  return router;
};

/** S-29: organizer (chủ sự kiện) hoặc admin khai báo cổng soát vé. Mount tại /api/events. */
const createEventGateRouter = ({ service = createGateScanService(), database = db } = {}) => {
  const router = createSecureRouter();
  const MANAGERS = { roles: ['organizer', 'admin'] };
  const loadManageable = async (req, res) => {
    const id = Number(req.params.id);
    const event = Number.isSafeInteger(id) && id > 0 ? await database('events').where({ id }).first() : null;
    if (!event) {
      res.status(404).json({ success: false, message: 'Không tìm thấy sự kiện.' });
      return null;
    }
    if (req.user.role !== 'admin' && event.organizer_id !== req.user.userId) {
      req.denyReason = `User ${req.user.userId} không sở hữu event ${id}`;
      res.status(403).json({ success: false, message: 'Bạn không có quyền quản lý sự kiện này.' });
      return null;
    }
    return event;
  };

  router.get('/:id/gates', MANAGERS, async (req, res) => {
    try {
      const event = await loadManageable(req, res);
      if (!event) return undefined;
      return res.json({ success: true, data: { gates: await service.gatesFor(event.id) } });
    } catch (error) {
      return sendError(error, res, 'EventGates');
    }
  });

  router.put('/:id/gates', MANAGERS, async (req, res) => {
    try {
      const event = await loadManageable(req, res);
      if (!event) return undefined;
      const gates = await service.replaceGates(event.id, req.body?.gates);
      return res.json({ success: true, message: 'Đã lưu danh sách cổng.', data: { gates } });
    } catch (error) {
      return sendError(error, res, 'EventGates');
    }
  });
  return router;
};

module.exports = {
  createEventGateRouter,
  createScannerRouter,
  eventGateRouter: createEventGateRouter(),
  scannerRouter: createScannerRouter(),
};
