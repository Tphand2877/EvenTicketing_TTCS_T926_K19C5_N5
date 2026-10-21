require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const protectedRoutes = require('./routes/protectedRoutes');
const { eventRouter, showtimeRouter } = require('./routes/eventRoutes');
const { createPaymentRouter, paymentRouter } = require('./routes/paymentRoutes');
const { createMockPaymentRouter } = require('./routes/mockPaymentRoutes');
const { createPaymentWebhookRouter, paymentWebhookRouter } = require('./routes/paymentWebhookRoutes');
const { createPaymentWebhookService } = require('./services/paymentWebhookService');
const { ticketRouter } = require('./routes/ticketRoutes');
const { adminUserRouter } = require('./routes/adminUserRoutes');
const { eventGateRouter, scannerRouter } = require('./routes/scannerRoutes');
const { orderRouter } = require('./routes/orderRoutes');
const { auditAccessDenials } = require('./middleware/auditLogger');
const { extractJsonErrorDetails } = require('./utils/seatMapValidator');

const createApp = ({ paymentService, paymentResultService, paymentGateway, paymentProvider } = {}) => {
const app = express();
// T-49: chỉ tin X-Forwarded-For khi chạy sau proxy đã biết (Nginx trong docker-compose đặt TRUST_PROXY=1).
// Không đặt thì req.ip là địa chỉ kết nối thật, người gửi không tự khai IP được.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

// ─── Middleware cơ bản ───────────────────────────────────────────────────────
app.use(cors());

// ─── SCRUM-212 [S-21 / T-48]: webhook thanh toán ───────────────────────────────
// Giữ nguyên bytes thô, KHÔNG qua bộ đọc JSON chung: adapter của cổng (T-40/T-42) kiểm
// chữ ký trên đúng các bytes này trước khi bất kỳ nội dung nào được dùng.
app.use('/api/payments/webhook', express.raw({ type: () => true, limit: '64kb' }), (req, _res, next) => {
  if (Buffer.isBuffer(req.body)) req.rawBody = req.body;
  next();
});

// 5mb: giới hạn kích thước tệp sơ đồ ghế tối đa 5 MB (S-06 NFR)
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ─── SCRUM-72 T-10: Audit logging cho mọi request bị từ chối (401/403) ────────
// Mount TRƯỚC routes để bắt được cả các route bị chặn bởi deny-by-default (T-08)
app.use(auditAccessDenials);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRouter);       // SCRUM-80
app.use('/api/events', eventGateRouter);   // S-29: cổng soát vé của sự kiện
app.use('/api/showtimes', showtimeRouter); // SCRUM-80, SCRUM-84
app.use('/api/payments', paymentService ? createPaymentRouter({ paymentService }) : paymentRouter); // S-18 / T-41
// T-46: receipts are deduplicated before T-42 settles, for the provider the server selected (T-44).
const webhookService = paymentResultService
  ? createPaymentWebhookService({ paymentResults: paymentResultService }) : undefined;
app.use('/api/payments', paymentResultService
  ? createPaymentWebhookRouter({ paymentResults: paymentResultService, service: webhookService })
  : paymentWebhookRouter);
if (paymentProvider === 'mock') {
  app.use('/api/payments/mock', createMockPaymentRouter({ gateway: paymentGateway, paymentResultService, webhookService }));
}
app.use('/api/tickets', ticketRouter);     // S-25 / S-26
app.use('/api/admin', adminUserRouter);    // S-28
app.use('/api/scanner', scannerRouter);    // S-29 / S-30 / S-31
app.use('/api/orders', orderRouter);       // SCRUM-220 [S-32]
app.use('/api', protectedRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route không tồn tại.' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  // S-06 NFR: Xử lý tệp vượt quá 5 MB
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      success: false,
      message: 'Kích thước tệp vượt quá giới hạn cho phép (5 MB).',
    });
  }

  // S-06 AC4: Tệp không phải JSON hợp lệ -> trả 400 kèm vị trí ký tự, không sinh lỗi 500
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    const { position, line, column } = extractJsonErrorDetails(err, err.body);
    let detail = `Định dạng JSON không hợp lệ: ${err.message}`;
    if (position !== null && line !== null && column !== null) {
      detail = `Định dạng JSON không hợp lệ tại vị trí ký tự ${position} (position ${position}, dòng ${line}, cột ${column}): ${err.message}`;
    } else if (position !== null) {
      detail = `Định dạng JSON không hợp lệ tại vị trí ký tự ${position} (position ${position}): ${err.message}`;
    }
    return res.status(400).json({
      success: false,
      message: detail,
      position: position !== null ? position : undefined,
      line: line !== null ? line : undefined,
      column: column !== null ? column : undefined,
    });
  }

  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    // Database errors can include query parameters containing user/order data.
    console.error('[GlobalError] Request failed.');
  }
  res.status(status).json({
    success: false,
    message: status === 400 ? (err.message || 'Dữ liệu JSON không hợp lệ.') : 'Lỗi máy chủ không xác định.',
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────
// Chỉ mở cổng khi chạy trực tiếp (node src/app.js), không mở khi test import file này
return app;
};
const app = createApp();
module.exports = app; // export để test, không tạo timer hoặc mở cổng khi import
module.exports.createApp = createApp;
if (require.main === module) {
  require('./server').startServer().catch((error) => {
    const { PaymentConfigurationError } = require('./config/paymentProviderConfig');
    console.error(error instanceof PaymentConfigurationError
      ? `[Server] Payment configuration invalid: ${error.message}`
      : '[Server] Startup failed.');
    process.exitCode = 1;
  });
}
