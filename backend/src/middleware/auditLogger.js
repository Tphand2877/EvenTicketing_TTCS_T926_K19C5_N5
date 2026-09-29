/**
 * SCRUM-72 [S-02 (T-10)] - Audit Logging for Unauthorized Access Attempts
 *
 * Ghi lại MỌI response 401/403 (thời gian, endpoint, user nếu có, IP, lý do từ chối).
 * TUYỆT ĐỐI không log password, password_hash, hay body của request.
 */

const fs = require('fs');
const path = require('path');
const AuditLog = require('../models/AuditLog');

const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'audit.log');

/**
 * Dựng entry log CHỈ từ các trường an toàn - không bao giờ đọc req.body ở đây.
 */
function buildLogEntry(req, statusCode, reason) {
  return {
    method: req.method,
    endpoint: (req.originalUrl || req.url || '').split('?')[0], // bỏ query string
    user_id: (req.user && (req.user.userId || req.user.id)) || null,
    ip_address: req.ip || (req.connection && req.connection.remoteAddress) || 'unknown',
    reason: reason || 'Không có quyền truy cập',
    status_code: statusCode,
  };
}

function writeToFile(entry) {
  fs.mkdir(LOG_DIR, { recursive: true }, () => {
    const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() });
    fs.appendFile(LOG_FILE, line + '\n', () => {});
  });
}

/**
 * Ghi 1 lần bị từ chối truy cập, ra file (best-effort) và vào bảng audit_logs (best-effort).
 * Không bao giờ được phép làm crash request chính vì lỗi ghi log.
 */
async function persistDenial(req, statusCode, reason) {
  const entry = buildLogEntry(req, statusCode, reason);

  writeToFile(entry);

  try {
    await AuditLog.create(entry);
  } catch (err) {
    console.error('[auditLogger] Ghi audit_logs vào DB thất bại:', err.message);
  }
}

/**
 * Middleware toàn cục: lắng nghe MỌI response trả về 401/403 và ghi log.
 * Mount TRƯỚC khi gắn routes để bắt được cả các route bị chặn bởi deny-by-default (T-08).
 */
function auditAccessDenials(req, res, next) {
  res.on('finish', () => {
    if (res.statusCode === 401 || res.statusCode === 403) {
      persistDenial(req, res.statusCode, req.denyReason).catch(() => {});
    }
  });
  next();
}

module.exports = { auditAccessDenials, persistDenial, buildLogEntry };
