require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const protectedRoutes = require('./routes/protectedRoutes');
const { eventRouter, showtimeRouter } = require('./routes/eventRoutes');
const { auditAccessDenials } = require('./middleware/auditLogger');

const app = express();

// ─── Middleware cơ bản ───────────────────────────────────────────────────────
app.use(cors());
// 1mb: đủ cho tệp sơ đồ ghế tối đa 10.000 ghế (S-05); mặc định 100kb chỉ ~2.000 ghế
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── SCRUM-72 T-10: Audit logging cho mọi request bị từ chối (401/403) ────────
// Mount TRƯỚC routes để bắt được cả các route bị chặn bởi deny-by-default (T-08)
app.use(auditAccessDenials);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRouter);       // SCRUM-80
app.use('/api/showtimes', showtimeRouter); // SCRUM-80, SCRUM-84
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
module.exports = app; // export để test, không tạo timer hoặc mở cổng khi import
if (require.main === module) {
  require('./server').startServer({ app }).catch(() => {
    console.error('[Server] Startup failed.');
    process.exitCode = 1;
  });
}
