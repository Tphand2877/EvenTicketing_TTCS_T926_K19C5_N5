/**
 * S-29: các cổng soát vé của một sự kiện. Nhân viên chọn suất + cổng trước khi quét.
 * Sự kiện chưa khai báo cổng nào thì dùng một cổng mặc định "Cổng chính".
 */
exports.up = async (knex) => {
  await knex.schema.createTable('event_gates', (table) => {
    table.increments('id').primary();
    table.integer('event_id').notNullable().references('id').inTable('events').onDelete('CASCADE');
    table.string('name', 100).notNullable();
    table.integer('position').notNullable().defaultTo(0);
    table.check('length(btrim(name)) > 0');
  });
  await knex.raw('CREATE UNIQUE INDEX event_gates_event_name_unique ON event_gates (event_id, lower(name))');
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('event_gates');
};
