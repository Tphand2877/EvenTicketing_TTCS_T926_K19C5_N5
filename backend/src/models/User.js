const db = require('../config/database');

const TABLE = 'users';

const User = {
  /**
   * Tìm user theo email (kèm tên role)
   */
  findByEmail: (email) =>
    db(TABLE)
      .join('roles', 'users.role_id', 'roles.id')
      .where('users.email', email)
      .select(
        'users.id',
        'users.email',
        'users.password_hash',
        'users.full_name',
        'users.is_active',
        'users.deactivated_at',
        'users.role_id',
        'users.failed_login_attempts',
        'users.locked_until',
        'roles.name as role'
      )
      .first(),

  /**
   * Tìm user theo ID (kèm tên role)
   */
  findById: (id) =>
    db(TABLE)
      .join('roles', 'users.role_id', 'roles.id')
      .where('users.id', id)
      .select(
        'users.id',
        'users.email',
        'users.full_name',
        'users.is_active',
        'users.deactivated_at',
        'users.role_id',
        'users.created_at',
        'roles.name as role'
      )
      .first(),

  /**
   * Tạo user mới
   */
  create: (userData) =>
    db(TABLE).insert(userData).returning('id'),

  /**
   * Cập nhật user theo ID
   */
  updateById: (id, data) =>
    db(TABLE).where({ id }).update({ ...data, updated_at: db.fn.now() }),

  /**
   * Tìm theo activation token
   */
  findByActivationToken: (token) =>
    db(TABLE).where({ activation_token: token }).first(),

  /**
   * S-28: Lấy danh sách users kèm role cho admin
   */
  listAll: ({ page = 1, limit = 20, search = '', role = '', status = '' } = {}) => {
    let query = db(TABLE)
      .join('roles', 'users.role_id', 'roles.id')
      .select(
        'users.id',
        'users.email',
        'users.full_name',
        'users.role_id',
        'roles.name as role',
        'users.is_active',
        'users.deactivated_at',
        'users.created_at',
        'users.updated_at'
      );

    if (search) {
      query = query.where((builder) => {
        builder
          .whereILike('users.email', `%${search}%`)
          .orWhereILike('users.full_name', `%${search}%`);
      });
    }

    if (role && role !== 'all') {
      query = query.where('roles.name', role);
    }

    if (status === 'active') {
      query = query.where('users.is_active', true).whereNull('users.deactivated_at');
    } else if (status === 'deactivated') {
      query = query.where((builder) => {
        builder.where('users.is_active', false).orWhereNotNull('users.deactivated_at');
      });
    }

    const offset = (Math.max(1, page) - 1) * limit;
    return query.orderBy('users.id', 'desc').limit(limit).offset(offset);
  },

  /**
   * S-28: Đếm tổng số users theo bộ lọc
   */
  countAll: async ({ search = '', role = '', status = '' } = {}) => {
    let query = db(TABLE)
      .join('roles', 'users.role_id', 'roles.id');

    if (search) {
      query = query.where((builder) => {
        builder
          .whereILike('users.email', `%${search}%`)
          .orWhereILike('users.full_name', `%${search}%`);
      });
    }

    if (role && role !== 'all') {
      query = query.where('roles.name', role);
    }

    if (status === 'active') {
      query = query.where('users.is_active', true).whereNull('users.deactivated_at');
    } else if (status === 'deactivated') {
      query = query.where((builder) => {
        builder.where('users.is_active', false).orWhereNotNull('users.deactivated_at');
      });
    }

    const res = await query.count('users.id as count').first();
    return Number(res?.count || 0);
  },

  /**
   * S-28: Đếm số lượng Admin đang hoạt động (tránh vô tình tự hạ admin cuối cùng)
   */
  countActiveAdmins: async () => {
    const res = await db(TABLE)
      .join('roles', 'users.role_id', 'roles.id')
      .where('roles.name', 'admin')
      .where('users.is_active', true)
      .whereNull('users.deactivated_at')
      .count('users.id as count')
      .first();
    return Number(res?.count || 0);
  },
};

module.exports = User;
