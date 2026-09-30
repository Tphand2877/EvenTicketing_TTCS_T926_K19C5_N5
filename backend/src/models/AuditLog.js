const db = require('../config/database');

const TABLE = 'audit_logs';

const AuditLog = {
  create: (entry) => db(TABLE).insert(entry),
  findRecent: (limit = 100) => db(TABLE).orderBy('created_at', 'desc').limit(limit),
};

module.exports = AuditLog;
