const db = require('../config/database');

const TABLE = 'roles';

const Role = {
  findAll: () => db(TABLE).select('*'),

  findByName: (name) => db(TABLE).where({ name }).first(),

  findById: (id) => db(TABLE).where({ id }).first(),
};

module.exports = Role;
