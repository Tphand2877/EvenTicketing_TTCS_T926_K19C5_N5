/** Separate process used by the PostgreSQL integration suite. */
const knex = require('knex');
const config = require('../../knexfile').test;
const { createSeatHoldRepository } = require('../../src/models/SeatHold');
const { createSeatHoldService } = require('../../src/services/seatHoldService');
const { startSeatHoldCleanupJob } = require('../../src/jobs/seatHoldCleanupJob');
const database = knex({ ...config, searchPath: [process.env.INTEGRATION_TEST_SCHEMA], pool: { min: 0, max: 2 } });
const service = createSeatHoldService(createSeatHoldRepository(database));
const main = async () => {
  if (process.argv[2] === 'startup') {
    const job = startSeatHoldCleanupJob({ cleanup: () => service.cleanupExpired() });
    await job.ready;
    await job.stop();
    const rows = await database('seat_holds').where({ status: 'active' }).where('expires_at', '<=', database.fn.now());
    return { remainingExpired: rows.length };
  }
  const args = JSON.parse(process.argv[3]);
  try {
    await service.holdSeats({ showtimeId: 1, userId: args.userId, quantity: 1 });
    return { success: true };
  } catch (error) {
    if (error.code !== 'INSUFFICIENT_SEATS') throw error;
    return { success: false, code: error.code };
  }
};
main().then((result) => process.stdout.write(JSON.stringify(result)))
  .catch(() => { process.stderr.write('Integration child failed.'); process.exitCode = 1; })
  .finally(() => database.destroy());
