const db = require('../config/database');

const TABLE = 'showtimes';

const Showtime = {
  listByEvent: (eventId) =>
    db(TABLE).where({ event_id: eventId }).orderBy('starts_at', 'asc'),

  findById: (id) => db(TABLE).where({ id }).first(),

  create: (data) => db(TABLE).insert(data).returning('*'),

  updateById: (id, data) =>
    db(TABLE).where({ id }).update({ ...data, updated_at: db.fn.now() }).returning('*'),

  deleteById: (id) => db(TABLE).where({ id }).del(),
};

module.exports = Showtime;
