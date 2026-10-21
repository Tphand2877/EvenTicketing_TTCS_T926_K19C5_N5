const db = require('../config/database');
const { hashPassword } = require('../utils/passwordHash');

/**
 * S-28: admin tạo tài khoản nhân viên và gán vai trò.
 * Tài khoản do admin tạo được kích hoạt ngay (không qua email). Vai trò lấy từ bảng roles.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAGE_SIZE = 20;

class StaffAccountError extends Error {
  constructor(code, status, field) {
    super(code);
    this.name = 'StaffAccountError';
    this.code = code;
    this.status = status;
    if (field) this.field = field;
  }
}

const present = (row) => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  role: row.role,
  isActive: row.is_active,
  createdAt: row.created_at,
  createdBy: row.created_by,
});

const userQuery = (database) => database('users')
  .join('roles', 'roles.id', 'users.role_id')
  .select('users.id', 'users.email', 'users.full_name', 'users.is_active', 'users.created_at',
    'users.created_by', 'roles.name as role');

const createStaffAccountService = ({ database = db, hash = hashPassword } = {}) => {
  const findRole = async (name, trx = database) => {
    if (typeof name !== 'string' || !name) throw new StaffAccountError('ROLE_INVALID', 400, 'role');
    const role = await trx('roles').where({ name }).first();
    if (!role) throw new StaffAccountError('ROLE_INVALID', 400, 'role');
    return role;
  };

  return {
    listRoles: () => database('roles').select('name', 'description').orderBy('id'),

    async listUsers({ role, q, page = 1 } = {}) {
      const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
      const query = userQuery(database);
      if (role) query.where('roles.name', role);
      if (q && typeof q === 'string' && q.trim()) {
        const term = `%${q.trim().toLowerCase().replace(/[%_\\]/g, '\\$&')}%`;
        query.where((w) => w.whereRaw('lower(users.email) LIKE ?', [term]).orWhereRaw('lower(users.full_name) LIKE ?', [term]));
      }
      const [{ n }] = await query.clone().clearSelect().count({ n: '*' });
      const rows = await query.orderBy('users.id', 'desc').limit(PAGE_SIZE).offset((pageNumber - 1) * PAGE_SIZE);
      return { users: rows.map(present), page: pageNumber, pageSize: PAGE_SIZE, total: Number(n) };
    },

    async createUser({ adminId, email, fullName, password, role }) {
      if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
        throw new StaffAccountError('EMAIL_INVALID', 400, 'email');
      }
      if (typeof fullName !== 'string' || !fullName.trim() || fullName.trim().length > 255) {
        throw new StaffAccountError('FULL_NAME_REQUIRED', 400, 'fullName');
      }
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        throw new StaffAccountError('PASSWORD_TOO_SHORT', 400, 'password');
      }
      const roleRow = await findRole(role);
      const normalizedEmail = email.trim().toLowerCase();
      const passwordHash = await hash(password);
      const [created] = await database('users').insert({
        email: normalizedEmail,
        password_hash: passwordHash,
        full_name: fullName.trim(),
        role_id: roleRow.id,
        is_active: true,
        created_by: adminId,
      }).onConflict('email').ignore().returning('id');
      if (!created) throw new StaffAccountError('EMAIL_TAKEN', 409, 'email');
      return present(await userQuery(database).where('users.id', created.id).first());
    },

    async updateUser({ adminId, userId, role, isActive, fullName }) {
      const id = Number(userId);
      if (!Number.isSafeInteger(id) || id <= 0) throw new StaffAccountError('USER_NOT_FOUND', 404);
      if (role === undefined && isActive === undefined && fullName === undefined) {
        throw new StaffAccountError('NOTHING_TO_UPDATE', 400);
      }
      // Admin không tự hạ quyền hay tự khoá mình, tránh hệ thống không còn ai quản trị
      if (id === adminId && (role !== undefined || isActive !== undefined)) {
        throw new StaffAccountError('CANNOT_CHANGE_SELF', 409);
      }
      if (isActive !== undefined && typeof isActive !== 'boolean') {
        throw new StaffAccountError('IS_ACTIVE_INVALID', 400, 'isActive');
      }
      if (fullName !== undefined && (typeof fullName !== 'string' || !fullName.trim() || fullName.trim().length > 255)) {
        throw new StaffAccountError('FULL_NAME_REQUIRED', 400, 'fullName');
      }
      return database.transaction(async (trx) => {
        const user = await trx('users').where({ id }).forUpdate().first();
        if (!user) throw new StaffAccountError('USER_NOT_FOUND', 404);
        const changes = {};
        if (role !== undefined) changes.role_id = (await findRole(role, trx)).id;
        if (isActive !== undefined) changes.is_active = isActive;
        if (fullName !== undefined) changes.full_name = fullName.trim();
        await trx('users').where({ id }).update({ ...changes, updated_at: trx.fn.now() });
        return present(await userQuery(trx).where('users.id', id).first());
      });
    },
  };
};

module.exports = { StaffAccountError, createStaffAccountService };
