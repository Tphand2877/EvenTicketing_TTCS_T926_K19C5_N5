const { createSeatMapService } = require('../src/services/seatMapService');

const makeDatabase = ({ deleteError } = {}) => {
  const trx = (table) => {
    const builder = {
      where() { return this; },
      forUpdate() { return this; },
      first() { return Promise.resolve(table === 'showtimes' ? { id: 1 } : undefined); },
      select() { return Promise.resolve([]); },
      del() {
        if (deleteError) return Promise.reject(deleteError);
        return Promise.resolve(0);
      },
      insert(rows) {
        if (table === 'seat_categories') {
          return {
            returning: async () => rows.map((row, index) => ({ id: index + 1, name: row.name })),
          };
        }
        return Promise.resolve();
      },
      update() { return Promise.resolve(1); },
    };
    return builder;
  };
  trx.raw = async (sql) => {
    if (sql.includes('to_regclass')) return { rows: [{ present: false }] };
    throw new Error(`Unexpected SQL in fake transaction: ${sql}`);
  };
  trx.fn = { now: () => new Date() };

  return { transaction: (operation) => operation(trx) };
};

describe('seatMapService', () => {
  test('keeps legacy behavior when order-related tables do not exist', async () => {
    const service = createSeatMapService(makeDatabase());

    await expect(service.importSeatMap({
      showtimeId: 1,
      seats: [{ row: 'A', number: 1, category: 'VIP' }],
    })).resolves.toMatchObject({ seatCount: 1, replacedSeatCount: 0 });
  });

  test('maps a concurrent foreign-key allocation conflict to SEAT_MAP_LOCKED', async () => {
    const foreignKeyConflict = new Error('database adapter wrapped the driver error');
    foreignKeyConflict.cause = Object.assign(new Error('foreign key violation'), { code: '23503' });
    const service = createSeatMapService(makeDatabase({ deleteError: foreignKeyConflict }));

    await expect(service.importSeatMap({
      showtimeId: 1,
      seats: [{ row: 'A', number: 1, category: 'VIP' }],
    })).rejects.toMatchObject({ code: 'SEAT_MAP_LOCKED' });
  });
});
