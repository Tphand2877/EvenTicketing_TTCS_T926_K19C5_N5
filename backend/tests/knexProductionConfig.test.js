const environment = { ...process.env };

afterEach(() => {
  process.env = { ...environment };
  jest.resetModules();
});

test('production database can use the credentials supplied by staging Docker', () => {
  delete process.env.DATABASE_URL;
  process.env.DB_HOST = 'postgres';
  process.env.DB_PORT = '5432';
  process.env.DB_NAME = 'eventticketing';
  process.env.DB_USER = 'staging_user';
  process.env.DB_PASSWORD = 'staging_password';

  jest.resetModules();
  const { production } = require('../knexfile');

  expect(production.connection).toEqual({
    host: 'postgres',
    port: '5432',
    database: 'eventticketing',
    user: 'staging_user',
    password: 'staging_password',
  });
});

test('an explicit production database URL still takes precedence', () => {
  process.env.DATABASE_URL = 'postgres://example.test/tickets';

  jest.resetModules();
  const { production } = require('../knexfile');

  expect(production.connection).toBe('postgres://example.test/tickets');
});
