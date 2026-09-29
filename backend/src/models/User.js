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
};

module.exports = User;
