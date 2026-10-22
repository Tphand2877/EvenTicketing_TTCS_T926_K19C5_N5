const { createSecureRouter } = require('../middleware/secureRoute');
const { createTicketEmailDispatcher } = require('../services/ticketNotificationService');

const securePage = (res, content) => {
  res.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  });
  return res.type('html').send(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Thanh toán thử</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:system-ui,-apple-system,sans-serif;padding:30px;max-width:500px;margin:0 auto;text-align:center;">${content}</body></html>`);
};

// Adapted from S-20's server-side checkout; only T-42 may settle the order.
const createMockPaymentRouter = ({ gateway, paymentResultService, webhookService,
  ticketEmails = createTicketEmailDispatcher() }) => {
  const router = createSecureRouter();
  router.get('/checkout', { public: true }, (req, res) => {
    let checkout;
    try { checkout = gateway.readCheckout(req.query.token); }
    catch { return res.status(400).json({ success: false }); }
    const token = req.query.token;
    return securePage(res, `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
        <h1 style="font-size:20px;font-weight:bold;margin-bottom:8px;color:#111827;">Cổng thanh toán giả lập (Mock)</h1>
        <p style="color:#6b7280;font-size:14px;margin-bottom:16px;">Môi trường thử nghiệm an toàn, không trừ tiền thật.</p>
        <div style="background:#f9fafb;border-radius:12px;padding:16px;margin-bottom:20px;text-align:left;">
          <div style="font-size:13px;color:#6b7280;">Số tiền thanh toán:</div>
          <div style="font-size:24px;font-weight:bold;color:#db2777;">${checkout.amountMinor} VND</div>
        </div>
        <form method="post" action="/api/payments/mock/complete">
          <input type="hidden" name="token" value="${token}">
          <button name="status" value="succeeded" style="width:100%;padding:12px;background:#db2777;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:bold;cursor:pointer;margin-bottom:10px;">Xác nhận thanh toán thành công</button>
          <button name="status" value="failed" style="width:100%;padding:10px;background:#f3f4f6;color:#4b5563;border:1px solid #d1d5db;border-radius:10px;font-size:14px;cursor:pointer;">Mô phỏng thanh toán thất bại</button>
        </form>
      </div>
    `);
  });
  router.post('/complete', { public: true }, async (req, res) => {
    let signed;
    try { signed = gateway.completeCheckout(req.body?.token, req.body?.status); }
    catch { return res.status(400).json({ success: false }); }
    let verified;
    try {
      verified = await paymentResultService.verifyWebhook(signed);
      // Same path as a gateway callback: S-20 receipt first, so a repeated click settles once.
      if (webhookService) await webhookService.handle({ verifiedResult: verified, rawPayload: signed.rawBody.toString('utf8') });
      else await paymentResultService.applyVerifiedResult(verified);
    } catch {
      console.error('[MockPayment] Processing failed.');
      return res.status(500).json({ success: false });
    }
    // S-27: như webhook thật, gửi email vé sau khi thanh toán đã commit (đơn chưa paid thì không làm gì)
    ticketEmails.dispatchOrder(verified.orderId).catch(() => console.error('[TicketEmail] Dispatch failed; will retry.'));

    let frontendOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';
    if (req.headers.referer) {
      try {
        const parsed = new URL(req.headers.referer).origin;
        if (parsed && !parsed.includes(':3000')) frontendOrigin = parsed;
      } catch {}
    }
    const returnUrl = `${frontendOrigin}/payment/return?orderId=${encodeURIComponent(verified.orderId)}`;
    if (req.body.status === 'failed') {
      return securePage(res, `
        <div style="background:#fff;border:1px solid #fecaca;border-radius:16px;padding:24px;">
          <div style="font-size:40px;margin-bottom:8px;">❌</div>
          <h2 style="font-size:18px;color:#991b1b;font-weight:bold;">Thanh toán thử thất bại.</h2>
          <p style="color:#6b7280;font-size:13px;margin-bottom:16px;">Giao dịch đã bị từ chối hoặc hủy bỏ.</p>
          <a href="${returnUrl}" style="display:inline-block;padding:10px 20px;background:#ef4444;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:bold;">Về kiểm tra đơn hàng</a>
          <script>setTimeout(function(){ window.location.href = '${returnUrl}'; }, 1500);</script>
        </div>
      `);
    }

    return securePage(res, `
      <div style="background:#fff;border:1px solid #bbf7d0;border-radius:16px;padding:24px;">
        <div style="font-size:40px;margin-bottom:8px;">✅</div>
        <h2 style="font-size:18px;color:#166534;font-weight:bold;">Đã nhận kết quả thanh toán thử.</h2>
        <p style="color:#6b7280;font-size:13px;margin-bottom:16px;">Trở về trang đơn hàng để xem trạng thái và in hóa đơn/vé.</p>
        <a href="${returnUrl}" style="display:inline-block;padding:12px 24px;background:#db2777;color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:bold;">Xem hóa đơn & Vé điện tử</a>
        <script>setTimeout(function(){ window.location.href = '${returnUrl}'; }, 600);</script>
      </div>
    `);
  });
  return router;
};

module.exports = { createMockPaymentRouter };
