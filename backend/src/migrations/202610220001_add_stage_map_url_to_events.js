exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('events', 'stage_map_url');
  if (!hasColumn) {
    await knex.schema.alterTable('events', (table) => {
      table.text('stage_map_url').nullable();
    });
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('events', 'stage_map_url');
  if (hasColumn) {
    await knex.schema.alterTable('events', (table) => {
      table.dropColumn('stage_map_url');
    });
  }
};
