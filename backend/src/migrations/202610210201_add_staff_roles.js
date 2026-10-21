/**
 * S-28: vai trò nhân viên do admin cấp.
 * - staff: nhân viên soát vé (quét QR tại cổng)
 * - supervisor: trưởng ca soát vé (quét QR + cho vào có ghi chú khi vé đã dùng)
 * created_by ghi admin đã tạo tài khoản.
 */
const STAFF_ROLES = [
  { name: 'staff', description: 'Nhân viên soát vé - quét QR tại cổng' },
  { name: 'supervisor', description: 'Trưởng ca soát vé - quét QR và cho vào có ghi chú' },
];

exports.up = async (knex) => {
  // DB mới (bảng roles còn trống) nhận đủ vai trò từ seeds/01_roles.js; không chiếm id 1, 2 của admin/organizer.
  // DB đang chạy (đã seed) được thêm 2 vai trò mới tại đây.
  const existing = await knex('roles').count({ n: '*' }).first();
  if (Number(existing.n) > 0) {
    // Lấy id sau id lớn nhất (bảng roles có thể được seed với id cố định mà không tăng sequence)
    for (const role of STAFF_ROLES) {
      await knex.raw(`INSERT INTO roles (id, name, description)
        SELECT COALESCE(MAX(id), 0) + 1, ?, ? FROM roles
        ON CONFLICT (name) DO NOTHING`, [role.name, role.description]);
    }
    await knex.raw("SELECT setval(pg_get_serial_sequence('roles', 'id'), (SELECT MAX(id) FROM roles))");
  }
  if (!(await knex.schema.hasColumn('users', 'created_by'))) {
    await knex.schema.alterTable('users', (table) => {
      table.integer('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    });
  }
};

exports.down = async (knex) => {
  await knex.schema.alterTable('users', (table) => table.dropColumn('created_by'));
  const roleIds = knex('roles').select('id').whereIn('name', STAFF_ROLES.map((role) => role.name));
  const inUse = await knex('users').whereIn('role_id', roleIds).count({ n: '*' }).first();
  if (Number(inUse.n) > 0) throw new Error('Cannot remove staff roles while accounts still use them.');
  await knex('roles').whereIn('name', STAFF_ROLES.map((role) => role.name)).del();
};
