const crypto = require('crypto');
const { assertPaymentGateway, PaymentGatewayError } = require('../IPaymentGateway');
const { readPaymentProviderConfig } = require('../../config/paymentProviderConfig');

const readMockOrigin = (value, deployment) => {
  let url;
  try { url = new URL(value); } catch { throw new Error('MOCK_PAYMENT_PUBLIC_ORIGIN must be an absolute origin.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local
    && ['development', 'test'].includes(deployment)))
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('MOCK_PAYMENT_PUBLIC_ORIGIN must be HTTPS (localhost HTTP is development/test only).');
  }
  return url.origin;
};

// Adapted from S-20's signed checkout and HMAC verification; settlement stays in T-42.
const createMockPaymentGateway = ({ secret, origin, deployment, now = Date.now } = {}) => {
  if (!['development', 'test', 'staging'].includes(deployment)) {
    throw new Error('Mock payment gateway is forbidden in production.');
  }
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
    throw new Error('MOCK_PAYMENT_WEBHOOK_SECRET must contain at least 32 bytes.');
  }
  const publicOrigin = readMockOrigin(origin, deployment);
  const sign = (domain, raw) => crypto.createHmac('sha256', secret).update(domain).update(raw).digest('hex');
  const equals = (actual, expected) => typeof actual === 'string' && /^[a-f0-9]{64}$/.test(actual)
    && crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  const validId = (id) => typeof id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  const verified = new WeakSet();

  const readCheckout = (token) => {
    if (typeof token !== 'string' || token.length > 2048) throw new Error('Invalid checkout token.');
    const [encoded, signature, extra] = token.split('.');
    if (extra !== undefined || !encoded || !equals(signature, sign('checkout:', encoded))) {
      throw new Error('Invalid checkout token.');
    }
    let checkout;
    try { checkout = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); }
    catch { throw new Error('Invalid checkout token.'); }
    if (!validId(checkout?.orderId) || !validId(checkout?.id)
      || !Number.isSafeInteger(checkout.amountMinor) || checkout.amountMinor <= 0
      || checkout.currency !== 'VND' || !Number.isSafeInteger(checkout.expiresAt)
      || checkout.expiresAt <= now()) throw new Error('Expired checkout token.');
    return checkout;
  };

  const createWebhook = (payload) => {
    const rawBody = JSON.stringify(payload);
    return { rawBody: Buffer.from(rawBody), headers: { 'x-mock-signature': sign('webhook:', rawBody) } };
  };

  const gateway = {
    async createPayment({ orderId, amountMinor, currency }) {
      if (!validId(orderId) || !Number.isSafeInteger(amountMinor) || amountMinor <= 0 || currency !== 'VND') {
        throw new PaymentGatewayError('INVALID_PAYMENT_REQUEST', 'Invalid mock payment request.');
      }
      const encoded = Buffer.from(JSON.stringify({ id: crypto.randomUUID(), orderId, amountMinor,
        currency, expiresAt: now() + 15 * 60 * 1000 })).toString('base64url');
      const token = `${encoded}.${sign('checkout:', encoded)}`;
      return { gatewayRequestId: orderId,
        redirectUrl: `${publicOrigin}/api/payments/mock/checkout?token=${encodeURIComponent(token)}` };
    },
    async verifyWebhook({ rawBody, headers = {} }) {
      if (!Buffer.isBuffer(rawBody) || rawBody.length > 65536 || rawBody.length === 0
        || !equals(headers['x-mock-signature'], sign('webhook:', rawBody))) {
        throw new PaymentGatewayError('INVALID_SIGNATURE', 'Mock signature verification failed.');
      }
      let payload;
      try { payload = JSON.parse(rawBody.toString('utf8')); }
      catch { throw new PaymentGatewayError('INVALID_WEBHOOK', 'Invalid mock result.'); }
      if (!payload || Array.isArray(payload)
        || Object.keys(payload).sort().join() !== 'amountMinor,currency,orderId,status,transactionId'
        || !validId(payload.orderId) || !Number.isSafeInteger(payload.amountMinor)
        || payload.amountMinor <= 0 || payload.currency !== 'VND'
        || !['succeeded', 'failed'].includes(payload.status)
        || typeof payload.transactionId !== 'string'
        || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(payload.transactionId)) {
        throw new PaymentGatewayError('INVALID_WEBHOOK', 'Invalid mock result.');
      }
      const result = { payload };
      verified.add(result);
      return result;
    },
    async readResult(result) {
      if (!verified.has(result)) throw new PaymentGatewayError('UNVERIFIED_WEBHOOK', 'Mock result was not verified.');
      const { payload } = result;
      return { providerEventId: payload.transactionId, orderId: payload.orderId,
        gatewayRequestId: payload.orderId, gatewayTransactionId: payload.transactionId,
        amountMinor: payload.amountMinor, currency: payload.currency, status: payload.status,
        occurredAt: new Date(now()).toISOString() };
    },
    readCheckout,
    completeCheckout(token, status) {
      if (!['succeeded', 'failed'].includes(status)) throw new Error('Invalid mock result status.');
      const checkout = readCheckout(token);
      return createWebhook({ transactionId: `mock-${checkout.id}-${status}`,
        orderId: checkout.orderId, amountMinor: checkout.amountMinor, currency: checkout.currency, status });
    },
  };
  return assertPaymentGateway(gateway);
};

const createMockPaymentGatewayFromEnv = ({ env = process.env } = {}) => {
  const { deployment } = readPaymentProviderConfig(env);
  let secret = env.MOCK_PAYMENT_WEBHOOK_SECRET?.trim();
  let origin = env.MOCK_PAYMENT_PUBLIC_ORIGIN?.trim();
  // Chỉ máy dev: thiếu cấu hình thì tự sinh khoá tạm (mất khi restart) và dùng backend localhost,
  // để `npm run dev` chạy được ngay. Staging vẫn bắt buộc khai báo đủ.
  if (deployment === 'development') {
    if (!secret) {
      secret = crypto.randomBytes(32).toString('hex');
      console.warn('[Payment] MOCK_PAYMENT_WEBHOOK_SECRET chưa đặt: dùng khoá tạm cho môi trường dev.');
    }
    if (!origin) origin = `http://localhost:${env.PORT || 3000}`;
  }
  return createMockPaymentGateway({ deployment, secret, origin });
};

module.exports = { createMockPaymentGateway, createMockPaymentGatewayFromEnv, readMockOrigin };
