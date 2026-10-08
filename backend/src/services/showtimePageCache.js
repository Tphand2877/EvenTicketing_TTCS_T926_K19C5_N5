const { createClient } = require('@redis/client');

// No sockets are opened on import. Redis is optional for availability, but needed
// to meet T-17's cache NFR. Offline commands never wait for reconnection.
const createShowtimePageCache = ({ url = process.env.REDIS_URL, factory = createClient, now = Date.now } = {}) => {
  let client;
  let connecting;
  let retryAt = 0;
  const ready = async () => {
    if (!url || now() < retryAt) return null;
    if (client?.isReady) return client;
    if (!connecting) {
      try {
        client = factory({ url, disableOfflineQueue: true, socket: { connectTimeout: 100, reconnectStrategy: false } });
        client.on('error', () => {}); // Never log URLs, credentials or connection details.
      } catch {
        retryAt = now() + 5000;
        return null;
      }
      connecting = client.connect().then(() => client).catch(() => {
        if (client.isOpen) client.destroy();
        retryAt = now() + 5000;
        return null;
      }).finally(() => { connecting = null; });
    }
    return connecting;
  };
  const command = async (args) => {
    const connection = await ready();
    if (!connection) return null;
    try { return await connection.sendCommand(args, { abortSignal: AbortSignal.timeout(100) }); }
    catch {
      if (connection.isOpen) connection.destroy();
      retryAt = now() + 5000;
      return null;
    }
  };
  return {
    async get(key) {
      const value = await command(['GET', key]);
      if (!value) return null;
      try { return JSON.parse(value); } catch { return null; }
    },
    async set(key, value) { await command(['SET', key, JSON.stringify(value), 'EX', '30']); },
    async close() {
      if (connecting) await connecting;
      if (client?.isOpen) client.destroy();
    },
  };
};
module.exports = { createShowtimePageCache, ...createShowtimePageCache() };
