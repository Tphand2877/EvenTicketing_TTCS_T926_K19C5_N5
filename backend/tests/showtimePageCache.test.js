const { createShowtimePageCache } = require('../src/services/showtimePageCache');
const fixture = () => {
  const client = { isReady: false, isOpen: false, on: jest.fn(), destroy: jest.fn(), sendCommand: jest.fn() };
  client.connect = jest.fn(async () => { client.isReady = true; client.isOpen = true; });
  client.destroy.mockImplementation(() => { client.isReady = false; client.isOpen = false; });
  const factory = jest.fn(() => client);
  return { client, factory };
};
test('Redis connects once, shares startup, and stores JSON for exactly 30 seconds', async () => {
  const { client, factory } = fixture();
  client.sendCommand.mockResolvedValue('{"value":1}');
  const cache = createShowtimePageCache({ url: 'redis://localhost', factory });
  expect(factory).not.toHaveBeenCalled();
  expect(await Promise.all([cache.get('a'), cache.get('b')])).toEqual([{ value: 1 }, { value: 1 }]);
  expect(client.connect).toHaveBeenCalledTimes(1);
  await cache.set('a', { value: 2 });
  expect(client.sendCommand).toHaveBeenCalledWith(['SET', 'a', '{"value":2}', 'EX', '30'], expect.objectContaining({ abortSignal: expect.any(AbortSignal) }));
  await cache.close();
  expect(client.destroy).toHaveBeenCalledTimes(1);
});
test('Missing Redis config and malformed cache values act as misses', async () => {
  expect(await createShowtimePageCache({ url: '' }).get('a')).toBeNull();
  expect(await createShowtimePageCache({ url: 'invalid-url' }).get('a')).toBeNull();
  const { client, factory } = fixture();
  client.sendCommand.mockResolvedValue('not-json');
  const cache = createShowtimePageCache({ url: 'redis://localhost', factory });
  expect(await cache.get('a')).toBeNull();
  await cache.close();
});
test('Redis outage is bounded and retried only after a cooldown', async () => {
  const { client, factory } = fixture();
  client.connect.mockRejectedValue(new Error('credential-containing error'));
  let time = 0;
  const cache = createShowtimePageCache({ url: 'redis://localhost', factory, now: () => time });
  expect(await cache.get('a')).toBeNull();
  time = 4000;
  expect(await cache.get('b')).toBeNull();
  expect(factory).toHaveBeenCalledTimes(1);
  time = 5000;
  expect(await cache.get('c')).toBeNull();
  expect(factory).toHaveBeenCalledTimes(2);
});
test('Command timeout discards the broken connection and falls back to SQL', async () => {
  const { client, factory } = fixture();
  client.sendCommand.mockRejectedValue(new Error('timeout'));
  const cache = createShowtimePageCache({ url: 'redis://localhost', factory });
  expect(await cache.get('a')).toBeNull();
  expect(client.destroy).toHaveBeenCalledTimes(1);
});
