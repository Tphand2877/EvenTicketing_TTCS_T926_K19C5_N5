const { createSeatSpecificHoldService } = require('../src/services/seatSpecificHoldService');

describe('S-14 T-32: restore the signed-in buyer hold', () => {
  const serverNow = new Date('2026-10-08T09:00:00.000Z');
  const expiresAt = new Date('2026-10-08T09:06:00.000Z');

  test('returns sorted seat IDs and the database deadline from one query', async () => {
    const db = {
      raw: jest.fn().mockResolvedValue({ rows: [
        {
          showtime_id: 14,
          server_now: serverNow,
          hold_id: 'hold-14',
          expires_at: expiresAt,
          quantity: 2,
          seat_id: 29,
        },
        {
          showtime_id: 14,
          server_now: serverNow,
          hold_id: 'hold-14',
          expires_at: expiresAt,
          quantity: 2,
          seat_id: 12,
        },
      ] }),
    };
    const service = createSeatSpecificHoldService(db);

    const result = await service.getCurrentHold({ showtimeId: 14, userId: 7 });

    expect(db.raw).toHaveBeenCalledTimes(1);
    expect(db.raw.mock.calls[0][1]).toEqual([7, 14]);
    expect(db.raw.mock.calls[0][0]).toContain("holds.status = 'active'");
    expect(db.raw.mock.calls[0][0]).toContain('holds.expires_at > statement_timestamp()');
    expect(result).toEqual({
      hold: {
        id: 'hold-14',
        showtimeId: 14,
        seatIds: [12, 29],
        quantity: 2,
        expiresAt: expiresAt.toISOString(),
        serverNow: serverNow.toISOString(),
      },
      serverNow: serverNow.toISOString(),
    });
  });

  test('returns no hold when the query has no unexpired active row for this buyer', async () => {
    const db = {
      raw: jest.fn().mockResolvedValue({ rows: [{
        showtime_id: 14,
        server_now: serverNow,
        hold_id: null,
        expires_at: null,
        quantity: null,
        seat_id: null,
      }] }),
    };
    const service = createSeatSpecificHoldService(db);

    await expect(service.getCurrentHold({ showtimeId: 14, userId: 8 })).resolves.toEqual({
      hold: null,
      serverNow: serverNow.toISOString(),
    });
  });

  test('fails closed if a live hold is missing seat mappings', async () => {
    const db = {
      raw: jest.fn().mockResolvedValue({ rows: [{
        showtime_id: 14,
        server_now: serverNow,
        hold_id: 'hold-14',
        expires_at: expiresAt,
        quantity: 2,
        seat_id: 12,
      }] }),
    };
    const service = createSeatSpecificHoldService(db);

    await expect(service.getCurrentHold({ showtimeId: 14, userId: 7 }))
      .rejects.toMatchObject({ code: 'SEAT_DATA_NOT_READY', status: 503 });
  });

  test('reports a missing showtime', async () => {
    const service = createSeatSpecificHoldService({
      raw: jest.fn().mockResolvedValue({ rows: [] }),
    });

    await expect(service.getCurrentHold({ showtimeId: 999, userId: 7 }))
      .rejects.toMatchObject({ code: 'SHOWTIME_NOT_FOUND', status: 404 });
  });
});
