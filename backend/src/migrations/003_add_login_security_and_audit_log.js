/**
 * SCRUM-72 [S-02 (T-07, T-10)]
 * - Thêm cột đếm số lần đăng nhập sai + thời điểm khóa vào bảng `users`
 * - Tạo bảng `audit_logs` để ghi nhận các lần truy cập bị từ chối (401/403)
 */

exports.up = async function (knex) {
  await knex.schema.alterTable('users', (table) => {
    table
      .integer('failed_login_attempts')
      .notNullable()
      .defaultTo(0)
      .comment('SCRUM-72 T-07: số lần đăng nhập sai liên tiếp');
    table
      .timestamp('locked_until')
      .nullable()
      .comment('SCRUM-72 T-07: thời điểm hết khóa, null = không bị khóa');
  });

  await knex.schema.createTable('audit_logs', (table) => {
    table.increments('id').primary();
    table.string('method', 10).notNullable();
    table.string('endpoint', 255).notNullable();
    table
      .integer('user_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.string('ip_address', 64).notNullable();
    table.string('reason', 255).notNullable();
    table.integer('status_code').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('failed_login_attempts');
    table.dropColumn('locked_until');
  });
};
