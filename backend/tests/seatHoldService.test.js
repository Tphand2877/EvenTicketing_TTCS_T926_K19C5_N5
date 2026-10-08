const { createSeatHoldService, DEFAULT_TTL_SECONDS } = require('../src/services/seatHoldService');
const { createMemoryRepository } = require('./helpers/memorySeatHoldRepository');
const NOW = Date.UTC(2026, 9, 1, 12);
const TTL = DEFAULT_TTL_SECONDS * 1000;
let repository;
let service;
const hold = (args = {}) => service.holdSeats({ showtimeId: 1, userId: 10, quantity: 2, now: NOW, ...args });
const availability = (now = NOW) => service.getAvailability({ showtimeId: 1, capacity: 3, now });

beforeEach(() => {
  delete process.env.SEAT_HOLD_TTL_SECONDS;
  repository = createMemoryRepository([{ id: 1, capacity: 3 }, { id: 2, capacity: 3 }]);
  service = createSeatHoldService(repository);
});
afterEach(() => delete process.env.SEAT_HOLD_TTL_SECONDS);

test('Hold reduces availability and preserves the public response contract', async () => {
  const result = await hold();
  expect(result).toEqual({ id: expect.any(String), showtimeId: 1, quantity: 2, expiresAt: new Date(NOW + TTL).toISOString() });
  expect(await availability()).toEqual({ capacity: 3, held: 2, available: 1 });
});
test('Insufficient capacity rejects without replacing the existing hold', async () => {
  const first = await hold({ quantity: 1 });
  await hold({ userId: 11, quantity: 2 });
  await expect(hold({ quantity: 2 })).rejects.toMatchObject({ code: 'INSUFFICIENT_SEATS', details: { available: 1 } });
  expect(repository.rows.get(first.id).status).toBe('active');
});
test('At exact expiry availability is free and querying does not cancel the stored row (AC2)', async () => {
  const first = await hold({ quantity: 3 });
  expect(await availability(NOW + TTL - 1)).toEqual({ capacity: 3, held: 3, available: 0 });
  expect(await availability(NOW + TTL)).toEqual({ capacity: 3, held: 0, available: 3 });
  expect(repository.rows.get(first.id).status).toBe('active');
  await expect(hold({ userId: 11, quantity: 3, now: NOW + TTL })).resolves.toMatchObject({ quantity: 3 });
});
test('Cleanup cancels expired holds once and preserves the cancellation time (AC1/NFR)', async () => {
  const first = await hold();
  expect(await service.cleanupExpired({ now: NOW + TTL })).toBe(1);
  const snapshot = { ...repository.rows.get(first.id) };
  expect(snapshot.status).toBe('cancelled');
  expect(await service.cleanupExpired({ now: NOW + TTL + 1000 })).toBe(0);
  expect(repository.rows.get(first.id)).toEqual(snapshot);
});
test('Cleanup preserves unexpired holds', async () => {
  const first = await hold();
  expect(await service.cleanupExpired({ now: NOW + TTL - 1 })).toBe(0);
  expect(repository.rows.get(first.id).status).toBe('active');
});
test('Replacing a hold cancels the old record and renews its TTL', async () => {
  const first = await hold();
  const second = await hold({ quantity: 3, now: NOW + 1000 });
  expect(second.id).not.toBe(first.id);
  expect(second.expiresAt).toBe(new Date(NOW + 1000 + TTL).toISOString());
  expect(repository.rows.get(first.id).status).toBe('cancelled');
  expect(await availability(NOW + 1000)).toMatchObject({ held: 3 });
  expect(await service.releaseHold({ holdId: first.id, userId: 10, now: NOW })).toBe('not_found');
});
test('Showtimes have independent capacity', async () => {
  await hold({ quantity: 3 });
  expect(await service.getAvailability({ showtimeId: 2, capacity: 3, now: NOW })).toMatchObject({ available: 3 });
});
test('Only the owner can release; retry returns not_found', async () => {
  const first = await hold();
  expect(await service.releaseHold({ holdId: first.id, userId: 99, now: NOW })).toBe('forbidden');
  expect(await service.releaseHold({ holdId: first.id, userId: 10, now: NOW })).toBe('released');
  expect(await service.releaseHold({ holdId: first.id, userId: 10, now: NOW })).toBe('not_found');
  expect(await availability()).toMatchObject({ available: 3 });
});
test('An expired/missing/invalid hold cannot be released', async () => {
  const first = await hold();
  expect(await service.releaseHold({ holdId: first.id, userId: 10, now: NOW + TTL })).toBe('not_found');
  expect(await service.releaseHold({ holdId: 'bad', userId: 10 })).toBe('not_found');
  expect(await service.releaseHold({ holdId: '00000000-0000-0000-0000-000000000000', userId: 10 })).toBe('not_found');
});
test('TTL retains the existing SEAT_HOLD_TTL_SECONDS contract', async () => {
  process.env.SEAT_HOLD_TTL_SECONDS = '60';
  const first = await hold();
  expect(first.expiresAt).toBe(new Date(NOW + 60000).toISOString());
});
test('Missing showtime fails before storing a hold', async () => {
  await expect(hold({ showtimeId: 99 })).rejects.toMatchObject({ code: 'SHOWTIME_NOT_FOUND' });
});
test.each(['pending_payment', 'confirmed'])('Cleanup preserves a hold already assigned to an order (%s, AC4)', async (status) => {
  const first = await hold({ quantity: 3 });
  // Given an allocation produced by checkout; S-12 does not implement checkout.
  Object.assign(repository.rows.get(first.id), { status, order_id: 'existing-order' });
  const snapshot = { ...repository.rows.get(first.id) };
  expect(await service.cleanupExpired({ now: NOW + TTL })).toBe(0);
  expect(repository.rows.get(first.id)).toEqual(snapshot);
  expect(await availability(NOW + TTL)).toMatchObject({ held: 3, available: 0 });
  expect(await service.releaseHold({ holdId: first.id, userId: 10, now: NOW })).toBe('not_found');
  await expect(hold({ userId: 11, now: NOW + TTL })).rejects.toMatchObject({ code: 'INSUFFICIENT_SEATS' });
});
