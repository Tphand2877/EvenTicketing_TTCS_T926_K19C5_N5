/**
 * S-28: Quản trị tạo tài khoản nhân viên và gán vai trò
 * - Bổ sung các roles: ticket_checker, accountant vào bảng roles
 * - Bổ sung cột deactivated_at, deactivated_by vào bảng users
 * - Tạo bảng role_change_logs để ghi nhật ký audit log khi đổi vai trò hoặc trạng thái (NFR-1)
 */

exports.up = async function (knex) {
  // 1. Thêm các vai trò mới vào bảng roles
  const existingRoles = await knex('roles').select('name');
  const roleNames = existingRoles.map((r) => r.name);

  const newRoles = [];
  if (!roleNames.includes('ticket_checker')) {
    newRoles.push({
      name: 'ticket_checker',
      description: 'Nhân viên soát vé - quét và kiểm tra vé tại cửa sự kiện',
    });
  }
  if (!roleNames.includes('accountant')) {
    newRoles.push({
      name: 'accountant',
      description: 'Kế toán - quản lý và đối soát doanh thu, đơn hàng thanh toán',
    });
  }

  if (newRoles.length > 0) {
    await knex('roles').insert(newRoles);
  }

  // 2. Thêm cột deactivated_at, deactivated_by vào bảng users
  const hasDeactivatedAt = await knex.schema.hasColumn('users', 'deactivated_at');
  if (!hasDeactivatedAt) {
    await knex.schema.alterTable('users', (table) => {
      table
        .timestamp('deactivated_at')
        .nullable()
        .comment('S-28 AC3: Thời điểm tài khoản bị quản trị viên vô hiệu hóa');
      table
        .integer('deactivated_by')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL');
    });
  }

  // 3. Tạo bảng role_change_logs (NFR-1)
  const hasRoleChangeLogs = await knex.schema.hasTable('role_change_logs');
  if (!hasRoleChangeLogs) {
    await knex.schema.createTable('role_change_logs', (table) => {
      table.increments('id').primary();
      table
        .integer('actor_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
        .comment('ID của người thực hiện thao tác (Admin)');
      table
        .integer('target_user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
        .comment('ID của tài khoản được tạo/thay đổi quyền');
      table.string('old_role', 50).nullable();
      table.string('new_role', 50).nullable();
      table
        .string('action', 50)
        .notNullable()
        .comment('CREATE_STAFF | ROLE_CHANGE | DEACTIVATE | ACTIVATE');
      table.string('reason', 255).nullable();
      table.string('ip_address', 64).nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('role_change_logs');

  const hasDeactivatedAt = await knex.schema.hasColumn('users', 'deactivated_at');
  if (hasDeactivatedAt) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('deactivated_by');
      table.dropColumn('deactivated_at');
    });
  }

  await knex('roles').whereIn('name', ['ticket_checker', 'accountant']).del();
};
