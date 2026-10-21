const { TextDecoder } = require('util');
const { createSecureRouter } = require('../middleware/secureRoute');
const { createPaymentResultService } = require('../services/paymentResultService');
const { createPaymentWebhookService, PaymentWebhookError } = require('../services/paymentWebhookService');

const createPaymentWebhookRouter = ({ paymentResults = createPaymentResultService(),
  service = createPaymentWebhookService({ paymentResults }) } = {}) => {
  const router = createSecureRouter();
  router.post('/webhook', { public: true }, async (req, res) => {
    // S-21 / T-48: app.js gives this route the exact raw bytes; nothing has parsed the body yet.
    if (!Buffer.isBuffer(req.rawBody)) return res.status(415).json({ success: false });
    if (req.rawBody.length > 65536) return res.status(413).json({ success: false });
    let rawPayload;
    try { rawPayload = new TextDecoder('utf-8', { fatal: true }).decode(req.rawBody); }
    catch { return res.status(400).json({ success: false }); }
    // S-21 / T-49: a rejected signature is logged once by auditAccessDenials, with req.ip as source.
    const reject = () => {
      req.denyReason = 'Chữ ký webhook không hợp lệ';
      return res.status(401).json({ success: false });
    };
    let verifiedResult;
    try { verifiedResult = await paymentResults.verifyWebhook({ rawBody: req.rawBody, headers: req.headers }); }
    catch { return reject(); }
    if (!verifiedResult) return reject();
    try {
      await service.handle({ verifiedResult, rawPayload });
    } catch (error) {
      if (error instanceof PaymentWebhookError) return res.status(error.status).json({ success: false });
      console.error('[PaymentWebhook] Processing failed.');
      return res.status(500).json({ success: false });
    }
    return res.status(200).json({ success: true });
  });
  return router;
};
module.exports = { createPaymentWebhookRouter, paymentWebhookRouter: createPaymentWebhookRouter() };
