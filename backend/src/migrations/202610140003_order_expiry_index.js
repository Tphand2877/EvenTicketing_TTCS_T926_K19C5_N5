exports.up = (knex) => knex.raw("CREATE INDEX orders_pending_expiry ON orders (expires_at, id) WHERE status = 'pending'");
exports.down = (knex) => knex.raw('DROP INDEX IF EXISTS orders_pending_expiry');
