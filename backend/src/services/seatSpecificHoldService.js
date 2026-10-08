const crypto = require('crypto');
const database = require('../config/database');

const DEFAULT_TTL_SECONDS = 600;
const MAX_TTL_SECONDS = 86400;

class SeatSpecificHoldError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = 'SeatSpecificHoldError';
    this.code = code;
    this.status = status;
  }
}

const getTtlSeconds = (value = process.env.SEAT_HOLD_TTL_SECONDS) => {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return DEFAULT_TTL_SECONDS;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds <= MAX_TTL_SECONDS
    ? seconds
    : DEFAULT_TTL_SECONDS;
};

const isUnavailableDependency = (error) => ['42P01', '42703'].includes(error?.code);
const isUniqueViolation = (error) => error?.code === '23505';

const holdResponse = (hold, seatIds, serverNow) => ({
  id: hold.id,
  showtimeId: hold.showtime_id,
  seatIds: seatIds.map(Number).sort((a, b) => a - b),
  quantity: seatIds.length,
  expiresAt: new Date(hold.expires_at).toISOString(),
  serverNow: new Date(serverNow).toISOString(),
});

const createSeatSpecificHoldService = (db = database, { ttlSeconds = getTtlSeconds } = {}) => {
  const loadShowtime = async (queryable, showtimeId, lock = false) => {
    const lockClause = lock ? 'FOR SHARE OF s, e' : '';
    const { rows } = await queryable.raw(`
      SELECT s.id, s.status, s.starts_at, e.status AS event_status
      FROM showtimes AS s
      JOIN events AS e ON e.id = s.event_id
      WHERE s.id = ?
      ${lockClause}
    `, [showtimeId]);
    const showtime = rows[0];
    if (!showtime) throw new SeatSpecificHoldError('SHOWTIME_NOT_FOUND', 'Không tìm thấy suất diễn.', 404);
    return showtime;
  };

  const assertBookableShowtime = (showtime, now) => {
    if (showtime.event_status !== 'published'
      || showtime.status !== 'on_sale'
      || new Date(showtime.starts_at) <= now) {
      throw new SeatSpecificHoldError('SHOWTIME_CLOSED', 'Suất diễn không còn mở bán.', 409);
    }
  };

  const currentDatabaseTime = async (queryable) => {
    const { rows } = await queryable.raw('SELECT statement_timestamp() AS server_now');
    return rows[0].server_now;
  };

  const clearExpiredHold = async (transaction, holdIds, now) => {
    if (holdIds.length === 0) return;
    await transaction('seat_holds').whereIn('id', holdIds).update({
      status: 'cancelled',
      cancelled_at: now,
    });
    await transaction('seat_hold_seats').whereIn('hold_id', holdIds).del();
  };

  const clearStaleSeatMappings = async (transaction, showtimeId, seatIds, now) => {
    await transaction.raw(`
      DELETE FROM seat_hold_seats AS allocations
      USING seat_holds AS holds
      WHERE holds.id = allocations.hold_id
        AND allocations.showtime_id = ?
        AND allocations.seat_id = ANY(?::integer[])
        AND (
          holds.status = 'cancelled'
          OR (holds.status = 'active' AND holds.expires_at <= ?)
        )
    `, [showtimeId, seatIds, now]);
  };

  const lockAndValidateSeats = async (transaction, showtimeId, seatIds) => {
    const { rows } = await transaction.raw(`
      SELECT id
      FROM seats
      WHERE showtime_id = ? AND id = ANY(?::integer[])
      ORDER BY id
      FOR UPDATE
    `, [showtimeId, seatIds]);
    if (rows.length !== seatIds.length) {
      throw new SeatSpecificHoldError('SEAT_NOT_FOUND', 'Một hoặc nhiều ghế không thuộc sơ đồ suất diễn.', 400);
    }
  };

  const findSoldSeats = async (transaction, showtimeId, seatIds) => {
    const { rows } = await transaction.raw(`
      SELECT DISTINCT seat_id
      FROM public_sold_seats
      WHERE showtime_id = ? AND seat_id = ANY(?::integer[])
    `, [showtimeId, seatIds]);
    return rows.map((row) => Number(row.seat_id));
  };

  const findExistingAllocations = async (transaction, showtimeId, seatIds, now) => {
    const { rows } = await transaction.raw(`
      SELECT allocations.seat_id, holds.id AS hold_id, holds.user_id,
        holds.status, holds.expires_at
      FROM seat_hold_seats AS allocations
      JOIN seat_holds AS holds ON holds.id = allocations.hold_id
      WHERE allocations.showtime_id = ?
        AND allocations.seat_id = ANY(?::integer[])
        AND (
          (holds.status = 'active' AND holds.expires_at > ?)
          OR holds.status IN ('pending_payment', 'confirmed')
        )
      ORDER BY allocations.seat_id
      FOR UPDATE OF allocations, holds
    `, [showtimeId, seatIds, now]);
    return rows;
  };

  const hasUnmappedLiveHold = async (transaction, showtimeId, now) => {
    const { rows } = await transaction.raw(`
      SELECT holds.id
      FROM seat_holds AS holds
      LEFT JOIN (
        SELECT hold_id, COUNT(*) AS seat_count
        FROM seat_hold_seats
        GROUP BY hold_id
      ) AS allocations ON allocations.hold_id = holds.id
      WHERE holds.showtime_id = ?
        AND (
          (holds.status = 'active' AND holds.expires_at > ?)
          OR holds.status IN ('pending_payment', 'confirmed')
        )
        AND COALESCE(allocations.seat_count, 0) <> holds.quantity
      LIMIT 1
    `, [showtimeId, now]);
    return rows.length > 0;
  };

  const serializeDbError = (error) => {
    if (error instanceof SeatSpecificHoldError) throw error;
    if (isUnavailableDependency(error)) {
      throw new SeatSpecificHoldError(
        'SEAT_DATA_NOT_READY',
        'Dữ liệu ghế chưa sẵn sàng.',
        503
      );
    }
    if (isUniqueViolation(error)) {
      throw new SeatSpecificHoldError(
        'SEAT_UNAVAILABLE',
        'Ghế vừa có người chọn. Vui lòng tải lại sơ đồ.',
        409
      );
    }
    throw error;
  };

  return {
    async getCurrentHold({ showtimeId, userId }) {
      try {
        const { rows } = await db.raw(`
          SELECT s.id AS showtime_id,
            statement_timestamp() AS server_now,
            holds.id AS hold_id, holds.expires_at, holds.quantity,
            allocations.seat_id
          FROM showtimes AS s
          LEFT JOIN seat_holds AS holds
            ON holds.showtime_id = s.id
            AND holds.user_id = ?
            AND holds.status = 'active'
            AND holds.expires_at > statement_timestamp()
          LEFT JOIN seat_hold_seats AS allocations
            ON allocations.showtime_id = s.id
            AND allocations.hold_id = holds.id
          WHERE s.id = ?
          ORDER BY allocations.seat_id
        `, [userId, showtimeId]);

        if (rows.length === 0) {
          throw new SeatSpecificHoldError('SHOWTIME_NOT_FOUND', 'Không tìm thấy suất diễn.', 404);
        }

        const serverNow = new Date(rows[0].server_now).toISOString();
        if (rows[0].hold_id === null) return { hold: null, serverNow };

        const seatIds = rows
          .filter((row) => row.seat_id !== null)
          .map((row) => Number(row.seat_id))
          .sort((a, b) => a - b);
        if (seatIds.length !== Number(rows[0].quantity)) {
          throw new SeatSpecificHoldError(
            'SEAT_DATA_NOT_READY',
            'Dữ liệu ghế chưa sẵn sàng.',
            503
          );
        }

        const hold = holdResponse({
          id: rows[0].hold_id,
          showtime_id: rows[0].showtime_id,
          expires_at: rows[0].expires_at,
        }, seatIds, serverNow);
        return { hold, serverNow };
      } catch (error) {
        return serializeDbError(error);
      }
    },

    async getServerTime(showtimeId) {
      try {
        const showtime = await loadShowtime(db, showtimeId);
        const now = await currentDatabaseTime(db);
        assertBookableShowtime(showtime, now);
        return { serverNow: new Date(now).toISOString() };
      } catch (error) {
        return serializeDbError(error);
      }
    },

    async holdSeats({ showtimeId, userId, seatIds }) {
      try {
        return await db.transaction(async (transaction) => {
          // Per-user row locking keeps concurrent additions in one shared session
          // while independent buyers and showtimes proceed concurrently.
          const user = await transaction('users').select('id').where({ id: userId }).forUpdate().first();
          if (!user) throw new SeatSpecificHoldError('USER_NOT_FOUND', 'Không tìm thấy tài khoản.', 404);

          const showtime = await loadShowtime(transaction, showtimeId, true);
          const beforeSeatLock = await currentDatabaseTime(transaction);
          assertBookableShowtime(showtime, beforeSeatLock);

          await lockAndValidateSeats(transaction, showtimeId, seatIds);
          const now = await currentDatabaseTime(transaction);
          assertBookableShowtime(showtime, now);

          const expired = await transaction('seat_holds')
            .select('id')
            .where({ showtime_id: showtimeId, user_id: userId, status: 'active' })
            .andWhere('expires_at', '<=', now)
            .forUpdate();
          await clearExpiredHold(transaction, expired.map((hold) => hold.id), now);

          await clearStaleSeatMappings(transaction, showtimeId, seatIds, now);

          const soldSeats = await findSoldSeats(transaction, showtimeId, seatIds);
          if (soldSeats.length > 0) {
            throw new SeatSpecificHoldError(
              'SEAT_UNAVAILABLE',
              'Ghế vừa có người chọn. Vui lòng tải lại sơ đồ.',
              409
            );
          }

          const existing = await transaction('seat_holds')
            .where({ showtime_id: showtimeId, user_id: userId, status: 'active' })
            .andWhere('expires_at', '>', now)
            .forUpdate()
            .first();
          const currentSeats = existing
            ? await transaction('seat_hold_seats')
              .where({ hold_id: existing.id })
              .orderBy('seat_id')
              .pluck('seat_id')
            : [];

          if (existing && currentSeats.length !== Number(existing.quantity)) {
            throw new SeatSpecificHoldError(
              'LEGACY_HOLD_REQUIRES_RELEASE',
              'Lượt giữ chỗ hiện tại chưa gắn với ghế cụ thể. Hãy hủy lượt giữ đó trước khi chọn ghế.',
              409
            );
          }

          if (await hasUnmappedLiveHold(transaction, showtimeId, now)) {
            throw new SeatSpecificHoldError(
              'UNMAPPED_HOLD_EXISTS',
              'Suất diễn còn lượt giữ cũ chưa gắn với mã ghế. Vui lòng thử lại sau khi lượt giữ đó kết thúc.',
              409
            );
          }

          const allocations = await findExistingAllocations(transaction, showtimeId, seatIds, now);
          if (allocations.some((allocation) => (
            allocation.status !== 'active'
            || Number(allocation.user_id) !== Number(userId)
            || allocation.hold_id !== existing?.id
          ))) {
            throw new SeatSpecificHoldError(
              'SEAT_UNAVAILABLE',
              'Ghế vừa có người chọn. Vui lòng tải lại sơ đồ.',
              409
            );
          }

          const seatSet = new Set(currentSeats.map(Number));
          seatIds.forEach((id) => seatSet.add(Number(id)));
          const allSeatIds = [...seatSet].sort((a, b) => a - b);
          const newlyAdded = allSeatIds.filter((id) => !currentSeats.some((current) => Number(current) === id));
          const hold = existing || {
            id: crypto.randomUUID(),
            showtime_id: showtimeId,
            user_id: userId,
            quantity: allSeatIds.length,
            status: 'active',
            expires_at: new Date(new Date(now).getTime() + ttlSeconds() * 1000),
          };

          if (!existing) {
            await transaction('seat_holds').insert(hold);
          }
          if (newlyAdded.length > 0) {
            await transaction('seat_hold_seats').insert(newlyAdded.map((seatId) => ({
              showtime_id: showtimeId,
              seat_id: seatId,
              hold_id: hold.id,
            })));
          }
          if (existing && newlyAdded.length > 0) {
            await transaction('seat_holds').where({ id: existing.id }).update({ quantity: allSeatIds.length });
          }

          return {
            hold: holdResponse(hold, allSeatIds, now),
            created: !existing,
          };
        });
      } catch (error) {
        return serializeDbError(error);
      }
    },

    async releaseSeat({ showtimeId, holdId, seatId, userId }) {
      try {
        return await db.transaction(async (transaction) => {
          const user = await transaction('users').select('id').where({ id: userId }).forUpdate().first();
          if (!user) return { status: 'not_found' };

          await loadShowtime(transaction, showtimeId, true);
          const now = await currentDatabaseTime(transaction);

          const hold = await transaction('seat_holds')
            .where({ id: holdId, showtime_id: showtimeId })
            .forUpdate()
            .first();
          if (!hold || hold.status !== 'active' || new Date(hold.expires_at) <= now) {
            return { status: 'not_found' };
          }
          if (Number(hold.user_id) !== Number(userId)) return { status: 'forbidden' };

          const removed = await transaction('seat_hold_seats')
            .where({ showtime_id: showtimeId, hold_id: holdId, seat_id: seatId })
            .del();
          if (removed === 0) return { status: 'not_found' };

          const remaining = await transaction('seat_hold_seats')
            .where({ hold_id: holdId })
            .orderBy('seat_id')
            .pluck('seat_id');
          if (remaining.length === 0) {
            await transaction('seat_holds').where({ id: holdId }).update({
              status: 'cancelled',
              cancelled_at: now,
            });
            return { status: 'released', hold: null };
          }

          await transaction('seat_holds').where({ id: holdId }).update({ quantity: remaining.length });
          return {
            status: 'released',
            hold: holdResponse(hold, remaining, now),
          };
        });
      } catch (error) {
        return serializeDbError(error);
      }
    },
  };
};

module.exports = {
  DEFAULT_TTL_SECONDS,
  MAX_TTL_SECONDS,
  SeatSpecificHoldError,
  getTtlSeconds,
  createSeatSpecificHoldService,
  ...createSeatSpecificHoldService(),
};
