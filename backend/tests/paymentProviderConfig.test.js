const { readPaymentProviderConfig } = require('../src/config/paymentProviderConfig');
const { createPaymentGateway } = require('../src/payments/createPaymentGateway');
const { createPaymentRuntime } = require('../src/config/paymentRuntime');

const config = (DEPLOY_ENV, PAYMENT_PROVIDER, extra = {}) => readPaymentProviderConfig({ DEPLOY_ENV,
  PAYMENT_PROVIDER, ...extra });

describe('T-44 provider selection', () => {
  test.each([
    ['staging', undefined, 'mock'],
    ['staging', 'momo', 'momo'],
    ['development', 'mock', 'mock'],
    ['test', undefined, 'mock'],
    ['production', 'momo', 'momo'],
  ])('%s with provider %s selects %s', (deployment, provider, expected) => {
    expect(config(deployment, provider).provider).toBe(expected);
  });
  test('production rejects mock, missing and unknown providers', () => {
    expect(() => config('production', 'mock')).toThrow('forbidden in production');
    expect(() => config('production', undefined)).toThrow('production requires explicit momo');
    expect(() => config('production', 'other')).toThrow('PAYMENT_PROVIDER must be momo or mock');
  });
  test('production-mode Node requires an explicit deployment classification', () => {
    expect(() => readPaymentProviderConfig({ NODE_ENV: 'production', PAYMENT_PROVIDER: 'mock' }))
      .toThrow('DEPLOY_ENV must be');
    expect(config('staging', undefined, { NODE_ENV: 'production' }).provider).toBe('mock');
  });
  test('legacy selector is rejected even when it agrees with the new selector', () => {
    expect(() => config('staging', 'mock', { PAYMENT_GATEWAY: 'mock' })).toThrow('obsolete');
    expect(() => config('staging', 'momo', { PAYMENT_GATEWAY: 'mock' })).toThrow('obsolete');
  });
  test('selected adapter must satisfy the T-40 interface', () => {
    expect(() => createPaymentGateway({ env: { DEPLOY_ENV: 'test', PAYMENT_PROVIDER: 'mock' },
      adapters: { mock: () => ({ createPayment() {} }) } })).toThrow('missing');
  });
  test('staging startup selects Mock, validates its secret and public HTTPS origin', () => {
    const env = { NODE_ENV: 'production', DEPLOY_ENV: 'staging',
      MOCK_PAYMENT_WEBHOOK_SECRET: 'test-only-secret-with-at-least-thirty-two-bytes',
      MOCK_PAYMENT_PUBLIC_ORIGIN: 'https://staging.example.test' };
    const runtime = createPaymentRuntime({ env });
    expect(runtime.configuration.provider).toBe('mock');
    expect(runtime.gateway).toEqual(expect.objectContaining({
      createPayment: expect.any(Function), verifyWebhook: expect.any(Function), readResult: expect.any(Function),
    }));
    expect(() => createPaymentRuntime({ env: { ...env, MOCK_PAYMENT_WEBHOOK_SECRET: '' } }))
      .toThrow('MOCK_PAYMENT_WEBHOOK_SECRET');
  });
  test('selected MoMo fails startup when credentials are missing', () => {
    expect(() => createPaymentRuntime({ env: { DEPLOY_ENV: 'production', PAYMENT_PROVIDER: 'momo' } }))
      .toThrow('MOMO_REDIRECT_URL');
  });
});
