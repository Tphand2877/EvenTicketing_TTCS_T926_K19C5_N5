/**
 * S-28 NFR-1: Model RoleChangeLog - Ghi nhận và truy vấn lịch sử thay đổi vai trò & trạng thái tài khoản
 */

const db = require('../config/database');

const TABLE = 'role_change_logs';

const RoleChangeLog = {
  /**
   * Tạo bản ghi nhật ký thay đổi vai trò / trạng thái
   */
  create: (logData) => db(TABLE).insert(logData).returning('*'),

  /**
   * Lấy danh sách nhật ký có phân trang và thông tin actor / target
   */
  list: async ({ limit = 50, offset = 0 } = {}) => {
    return db(TABLE)
      .leftJoin('users as actor', 'role_change_logs.actor_id', 'actor.id')
      .leftJoin('users as target', 'role_change_logs.target_user_id', 'target.id')
      .select(
        'role_change_logs.id',
        'role_change_logs.actor_id',
        'role_change_logs.target_user_id',
        'role_change_logs.old_role',
        'role_change_logs.new_role',
        'role_change_logs.action',
        'role_change_logs.reason',
        'role_change_logs.ip_address',
        'role_change_logs.created_at',
        'actor.email as actor_email',
        'actor.full_name as actor_name',
        'target.email as target_email',
        'target.full_name as target_name'
      )
      .orderBy('role_change_logs.created_at', 'desc')
      .limit(limit)
      .offset(offset);
  },

  /**
   * Đếm tổng số bản ghi log
   */
  count: async () => {
    const res = await db(TABLE).count('id as count').first();
    return Number(res?.count || 0);
  },
};

module.exports = RoleChangeLog;
