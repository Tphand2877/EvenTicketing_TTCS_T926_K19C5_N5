const { TextDecoder } = require('util');
const { createSecureRouter } = require('../middleware/secureRoute');
const { createPaymentResultService } = require('../services/paymentResultService');
const { createPaymentWebhookService, PaymentWebhookError } = require('../services/paymentWebhookService');

const createPaymentWebhookRouter = ({ paymentResults = createPaymentResultService(),
  service = createPaymentWebhookService({ paymentResults }) } = {}) => {
  const router = createSecureRouter();
  router.post('/webhook', { public: true }, async (req, res) => {
    // T-42's shared JSON parser already preserves the exact signed bytes in req.rawBody.
    if (!Buffer.isBuffer(req.rawBody)) return res.status(415).json({ success: false });
    if (req.rawBody.length > 65536) return res.status(413).json({ success: false });
    let rawPayload;
    try { rawPayload = new TextDecoder('utf-8', { fatal: true }).decode(req.rawBody); }
    catch { return res.status(400).json({ success: false }); }
    let verifiedResult;
    try { verifiedResult = await paymentResults.verifyWebhook({ rawBody: req.rawBody, headers: req.headers }); }
    catch { return res.status(401).json({ success: false }); }
    if (!verifiedResult) return res.status(401).json({ success: false });
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
