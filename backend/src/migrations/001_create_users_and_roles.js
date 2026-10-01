/**
 * SCRUM-73 [S-02 (T-04)] - users and roles Tables with Migration
 * Migration: Tạo bảng roles và users
 */

exports.up = async function (knex) {
  await knex.schema.createTable('roles', (table) => {
    table.increments('id').primary();
    table.string('name', 50).notNullable().unique().comment('buyer | organizer | admin');
    table.string('description', 255).nullable();
    table.timestamps(true, true); // created_at, updated_at
  });

  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('full_name', 255).nullable();
    table
      .integer('role_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('roles')
      .onDelete('RESTRICT');
    table.boolean('is_active').notNullable().defaultTo(false)
      .comment('false cho đến khi xác nhận email (S-03)');
    table.string('activation_token', 255).nullable()
      .comment('Token dùng để kích hoạt tài khoản qua email');
    table.timestamp('activation_token_expires_at').nullable();
    table.timestamps(true, true); // created_at, updated_at
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('roles');
};
