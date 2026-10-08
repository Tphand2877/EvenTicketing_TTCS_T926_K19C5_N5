require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const protectedRoutes = require('./routes/protectedRoutes');
const { eventRouter, showtimeRouter } = require('./routes/eventRoutes');
const { auditAccessDenials } = require('./middleware/auditLogger');
const { extractJsonErrorDetails } = require('./utils/seatMapValidator');

const app = express();

// ─── Middleware cơ bản ───────────────────────────────────────────────────────
app.use(cors());
// 5mb: giới hạn kích thước tệp sơ đồ ghế tối đa 5 MB (S-06 NFR)
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

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
module.exports = app; // export để test, không tạo timer hoặc mở cổng khi import
if (require.main === module) {
  require('./server').startServer({ app }).catch(() => {
    console.error('[Server] Startup failed.');
    process.exitCode = 1;
  });
}
