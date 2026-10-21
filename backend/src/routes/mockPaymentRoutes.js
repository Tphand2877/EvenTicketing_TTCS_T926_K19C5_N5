const { createSecureRouter } = require('../middleware/secureRoute');

const securePage = (res, content) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'" });
  return res.type('html').send(`<!doctype html><html lang="vi"><meta charset="utf-8"><title>Thanh toán thử</title><body>${content}</body></html>`);
};

// Adapted from S-20's server-side checkout; only T-42 may settle the order.
const createMockPaymentRouter = ({ gateway, paymentResultService, webhookService }) => {
  const router = createSecureRouter();
  router.get('/checkout', { public: true }, (req, res) => {
    let checkout;
    try { checkout = gateway.readCheckout(req.query.token); }
    catch { return res.status(400).json({ success: false }); }
    const token = req.query.token;
    return securePage(res, `<h1>Thanh toán thử</h1><p>Không thu tiền thật.</p><p>Số tiền: ${checkout.amountMinor} VND</p>
      <form method="post" action="/api/payments/mock/complete"><input type="hidden" name="token" value="${token}">
      <button name="status" value="succeeded">Thành công</button><button name="status" value="failed">Thất bại</button></form>`);
  });
  router.post('/complete', { public: true }, async (req, res) => {
    let signed;
    try { signed = gateway.completeCheckout(req.body?.token, req.body?.status); }
    catch { return res.status(400).json({ success: false }); }
    try {
      const verified = await paymentResultService.verifyWebhook(signed);
      // Same path as a gateway callback: S-20 receipt first, so a repeated click settles once.
      if (webhookService) await webhookService.handle({ verifiedResult: verified, rawPayload: signed.rawBody.toString('utf8') });
      else await paymentResultService.applyVerifiedResult(verified);
    } catch {
      console.error('[MockPayment] Processing failed.');
      return res.status(500).json({ success: false });
    }
    return securePage(res, req.body.status === 'failed' ? '<p>Thanh toán thử thất bại.</p>'
      : '<p>Đã nhận kết quả thanh toán thử. Trở về trang đơn hàng để xem trạng thái.</p>');
  });
  return router;
};

module.exports = { createMockPaymentRouter };
