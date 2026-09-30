/**
 * SCRUM-76 [S-03] - Buyer Registration & Email Verification
 * Migration: Tạo bảng verification_requests để phục vụ kiểm soát rate-limit gửi email kích hoạt
 * (Tối đa 5 lần mỗi giờ cho mỗi địa chỉ email)
 */

exports.up = async function (knex) {
  await knex.schema.createTable('verification_requests', (table) => {
    table.increments('id').primary();
    table.string('email', 255).notNullable().index();
    table.string('request_type', 50).notNullable().defaultTo('register').comment('register | resend');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now()).index();
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('verification_requests');
};
