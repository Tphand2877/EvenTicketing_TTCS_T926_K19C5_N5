require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const protectedRoutes = require('./routes/protectedRoutes');
const { auditAccessDenials } = require('./middleware/auditLogger');

const app = express();

// ─── Middleware cơ bản ───────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── SCRUM-72 T-10: Audit logging cho mọi request bị từ chối (401/403) ────────
// Mount TRƯỚC routes để bắt được cả các route bị chặn bởi deny-by-default (T-08)
app.use(auditAccessDenials);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
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
app.use((err, req, res, next) => {
  console.error('[GlobalError]', err);
  res.status(500).json({ success: false, message: 'Lỗi máy chủ không xác định.' });
});

// ─── Start server ─────────────────────────────────────────────────────────────
// Chỉ mở cổng khi chạy trực tiếp (node src/app.js), không mở khi test import file này
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
    console.log(`📋 Môi trường: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app; // export để test
