/**
 * Unit test trực tiếp cho seatCategoryService (S-15 / T-34)
 */

const { createSeatCategoryService, SeatCategoryError } = require('../src/services/seatCategoryService');

const createMockDatabase = ({ showtimes = [], categories = [], seats = [] } = {}) => {
  const showtimesList = [...showtimes];
  const categoriesList = [...categories];
  const seatsList = [...seats];

  const db = (tableName) => {
    let whereClause = {};

    const builder = {
      where: (colOrObj, val) => {
        if (typeof colOrObj === 'string') {
          whereClause[colOrObj.replace(/^c\./, '')] = val;
        } else if (colOrObj && typeof colOrObj === 'object') {
          Object.assign(whereClause, colOrObj);
        }
        return builder;
      },
      select: (..._fields) => builder,
      orderBy: () => builder,
      forUpdate: () => builder,
      first: async () => {
        if (tableName === 'showtimes') {
          return showtimesList.find((s) => s.id === whereClause.id);
        }
        return undefined;
      },
      update: async (changes) => {
        if (tableName === 'seat_categories') {
          const cat = categoriesList.find((c) => c.id === whereClause.id && c.showtime_id === whereClause.showtime_id);
          if (cat) Object.assign(cat, changes);
          return [cat];
        }
        if (tableName === 'showtimes') {
          const st = showtimesList.find((s) => s.id === whereClause.id);
          if (st) Object.assign(st, changes);
          return [st];
        }
        return [];
      },
    };

    // When awaited directly as builder
    builder.then = (resolve) => {
      if (tableName.startsWith('seat_categories')) {
        const result = categoriesList
          .filter((c) => c.showtime_id === whereClause.showtime_id || c.showtime_id === whereClause['c.showtime_id'])
          .map((c) => ({
            ...c,
            seat_count: seatsList.filter((s) => s.category_id === c.id).length,
          }));
        resolve(result);
      } else {
        resolve([]);
      }
    };

    return builder;
  };

  db.raw = (sql) => sql;
  db.fn = { now: () => new Date() };
  db.transaction = async (callback) => {
    const trx = (table) => db(table);
    trx.raw = db.raw;
    trx.fn = db.fn;
    return callback(trx);
  };

  return { db, showtimesList, categoriesList };
};

describe('seatCategoryService unit tests', () => {
  test('listCategoriesByShowtime returns formatted categories', async () => {
    const { db } = createMockDatabase({
      showtimes: [{ id: 1 }],
      categories: [
        { id: 10, showtime_id: 1, name: 'VIP', price: 500000 },
        { id: 11, showtime_id: 1, name: 'Thường', price: null },
      ],
      seats: [
        { id: 1, showtime_id: 1, category_id: 10 },
        { id: 2, showtime_id: 1, category_id: 10 },
      ],
    });

    const service = createSeatCategoryService(db);
    const result = await service.listCategoriesByShowtime(1);
    expect(result).toEqual([
      { id: 10, showtime_id: 1, name: 'VIP', price: 500000, seat_count: 2 },
      { id: 11, showtime_id: 1, name: 'Thường', price: null, seat_count: 0 },
    ]);
  });

  test('updateCategoryPrices: throws EMPTY_PRICES if empty array or non-array', async () => {
    const { db } = createMockDatabase();
    const service = createSeatCategoryService(db);

    await expect(service.updateCategoryPrices({ showtimeId: 1, prices: [] }))
      .rejects.toThrow(SeatCategoryError);
    await expect(service.updateCategoryPrices({ showtimeId: 1, prices: null }))
      .rejects.toMatchObject({ code: 'EMPTY_PRICES' });
  });

  test('updateCategoryPrices: throws SHOWTIME_NOT_FOUND if showtime missing', async () => {
    const { db } = createMockDatabase({ showtimes: [] });
    const service = createSeatCategoryService(db);

    await expect(service.updateCategoryPrices({ showtimeId: 99, prices: [{ id: 1, price: 100000 }] }))
      .rejects.toMatchObject({ code: 'SHOWTIME_NOT_FOUND' });
  });

  test('updateCategoryPrices: throws NO_CATEGORIES if showtime has no categories', async () => {
    const { db } = createMockDatabase({ showtimes: [{ id: 1 }], categories: [] });
    const service = createSeatCategoryService(db);

    await expect(service.updateCategoryPrices({ showtimeId: 1, prices: [{ id: 1, price: 100000 }] }))
      .rejects.toMatchObject({ code: 'NO_CATEGORIES' });
  });

  test('updateCategoryPrices: throws CATEGORY_NOT_FOUND if category does not belong to showtime', async () => {
    const { db } = createMockDatabase({
      showtimes: [{ id: 1 }],
      categories: [{ id: 10, showtime_id: 1, name: 'VIP', price: null }],
    });
    const service = createSeatCategoryService(db);

    await expect(service.updateCategoryPrices({ showtimeId: 1, prices: [{ id: 999, price: 100000 }] }))
      .rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND' });
  });

  test.each([
    [null, 'không được để trống'],
    ['', 'không được để trống'],
    ['100.5', 'không dùng số thực'],
    [100.5, 'không dùng số thực'],
    ['abc', 'số hợp lệ'],
    [-5000, 'không được là số âm'],
  ])('updateCategoryPrices: invalid price %p throws INVALID_PRICE', async (price, msg) => {
    const { db } = createMockDatabase({
      showtimes: [{ id: 1 }],
      categories: [{ id: 10, showtime_id: 1, name: 'VIP', price: null }],
    });
    const service = createSeatCategoryService(db);

    await expect(service.updateCategoryPrices({ showtimeId: 1, prices: [{ id: 10, price }] }))
      .rejects.toMatchObject({ code: 'INVALID_PRICE', message: expect.stringContaining(msg) });
  });

  test('updateCategoryPrices: updates prices by id and name successfully', async () => {
    const { db, categoriesList } = createMockDatabase({
      showtimes: [{ id: 1 }],
      categories: [
        { id: 10, showtime_id: 1, name: 'VIP', price: 100000 },
        { id: 11, showtime_id: 1, name: 'Thường', price: 50000 },
      ],
      seats: [{ id: 1, showtime_id: 1, category_id: 10 }],
    });
    const service = createSeatCategoryService(db);

    const result = await service.updateCategoryPrices({
      showtimeId: 1,
      prices: [
        { id: 10, price: 300000 },
        { name: 'Thường', price: 150000 },
      ],
    });

    expect(categoriesList.find((c) => c.id === 10).price).toBe(300000);
    expect(categoriesList.find((c) => c.id === 11).price).toBe(150000);
    expect(result).toHaveLength(2);
  });
});
