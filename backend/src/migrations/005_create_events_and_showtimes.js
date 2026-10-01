/**
 * SCRUM-80 - Events & Showtimes
 * Migration: Tạo bảng events (sự kiện) và showtimes (suất diễn)
 *
 * Ghi chú: migration 002 là placeholder rỗng và có thể đã được ghi nhận trong
 * knex_migrations ở các môi trường đã chạy. Sửa 002 sẽ không được chạy lại,
 * nên schema thật được tạo ở migration mới này.
 */

exports.up = async function (knex) {
  await knex.schema.createTable('events', (table) => {
    table.increments('id').primary();
    table
      .integer('organizer_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('title', 255).notNullable();
    table.text('description').nullable();
    table.string('category', 100).notNullable().defaultTo('Khac');
    table.string('venue', 255).notNullable();
    table.string('image_url', 500).nullable();
    table.string('status', 20).notNullable().defaultTo('published')
      .comment('draft | published');
    table.timestamps(true, true); // created_at, updated_at

    table.index(['status']);
    table.index(['organizer_id']);
  });

  await knex.schema.createTable('showtimes', (table) => {
    table.increments('id').primary();
    table
      .integer('event_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('events')
      .onDelete('CASCADE');
    table.timestamp('starts_at').notNullable();
    table.timestamp('ends_at').nullable();
    table.integer('price').notNullable().defaultTo(0).comment('Giá vé (VND)');
    table.integer('capacity').notNullable().comment('Tổng số chỗ của suất diễn');
    table.timestamps(true, true);

    table.index(['event_id', 'starts_at']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('showtimes');
  await knex.schema.dropTableIfExists('events');
};
