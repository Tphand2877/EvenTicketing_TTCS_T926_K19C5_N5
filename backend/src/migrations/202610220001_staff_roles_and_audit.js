/**
 * S-28: Quản trị tạo tài khoản nhân viên và gán vai trò
 * - Bổ sung các roles: ticket_checker, accountant vào bảng roles
 * - Bổ sung cột deactivated_at, deactivated_by vào bảng users
 * - Tạo bảng role_change_logs để ghi nhật ký audit log khi đổi vai trò hoặc trạng thái (NFR-1)
 */

exports.config = { transaction: true };

async function syncRolesSequence(knex) {
  await knex.raw(`
    SELECT setval(
      s.seq::regclass,
      COALESCE((SELECT MAX(id) FROM roles), 1),
      (SELECT COUNT(*) > 0 FROM roles)
    )
    FROM (
      SELECT pg_get_serial_sequence('roles', 'id') AS seq
    ) s
    WHERE s.seq IS NOT NULL
  `);
}

exports.up = async function (knex) {
  // 1. Thêm các vai trò mới vào bảng roles (chỉ khi bảng roles đã có dữ liệu khởi tạo)
  const existingCountRes = await knex('roles').count('* as count');
  const existingCount = Number(existingCountRes[0]?.count || 0);

  if (existingCount > 0) {
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
      // Đảm bảo bảng tracking tồn tại trước khi chèn roles
      const hasTracking = await knex.schema.hasTable('s28_created_roles');
      if (!hasTracking) {
        await knex.schema.createTable('s28_created_roles', (table) => {
          table.integer('role_id').primary();
          table.string('role_name', 50).notNullable();
        });
      }

      await syncRolesSequence(knex);
      const inserted = await knex('roles').insert(newRoles).returning(['id', 'name']);

      await knex('s28_created_roles').insert(
        inserted.map((r) => ({ role_id: r.id, role_name: r.name }))
      );

      await syncRolesSequence(knex);
    }
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
  // 1. Kiểm tra an toàn dữ liệu: Nếu role do S-28 tạo đang có tài khoản sử dụng, chặn rollback ngay lập tức
  const hasTracking = await knex.schema.hasTable('s28_created_roles');
  let trackedRoles = [];
  if (hasTracking) {
    trackedRoles = await knex('s28_created_roles').select('role_id', 'role_name');
    if (trackedRoles.length > 0) {
      const trackedIds = trackedRoles.map((r) => r.role_id);
      const inUse = await knex('users').whereIn('role_id', trackedIds).count('* as count');
      const count = Number(inUse[0]?.count || 0);

      if (count > 0) {
        const inUseNames = trackedRoles.map((r) => r.role_name).join(', ');
        throw new Error(
          `[S-28 Rollback Rejected] Không thể rollback: có ${count} người dùng đang sử dụng các vai trò do migration này tạo (${inUseNames}). Vui lòng chuyển vai trò của các tài khoản này trước khi rollback.`
        );
      }
    }
  }

  // 2. Thu hồi các thay đổi DDL (chỉ thực hiện sau khi đã xác nhận an toàn về dữ liệu)
  await knex.schema.dropTableIfExists('role_change_logs');

  const hasDeactivatedAt = await knex.schema.hasColumn('users', 'deactivated_at');
  if (hasDeactivatedAt) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('deactivated_by');
      table.dropColumn('deactivated_at');
    });
  }

  // 3. Xoá đúng các roles thực sự do migration này tạo và đồng bộ lại sequence
  if (hasTracking && trackedRoles.length > 0) {
    const trackedIds = trackedRoles.map((r) => r.role_id);
    await knex('roles').whereIn('id', trackedIds).del();
    await syncRolesSequence(knex);
    await knex.schema.dropTableIfExists('s28_created_roles');
  } else if (hasTracking) {
    await knex.schema.dropTableIfExists('s28_created_roles');
  }
};
