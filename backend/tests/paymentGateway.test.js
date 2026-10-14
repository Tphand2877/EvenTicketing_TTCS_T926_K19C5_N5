const { createPaymentGateway } = require('../src/payments/createPaymentGateway');
const { assertPaymentGateway, PaymentGatewayContractError } = require('../src/payments/IPaymentGateway');

const fakeGateway = {
  createPayment: jest.fn(),
  verifyWebhook: jest.fn(),
  readResult: jest.fn(),
};

describe('Payment gateway contract and selection (T-40)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('accepts an adapter implementing the three contract methods', () => {
    expect(assertPaymentGateway(fakeGateway)).toBe(fakeGateway);
  });

  test('rejects an adapter missing a required method', () => {
    expect(() => assertPaymentGateway({ createPayment: jest.fn(), verifyWebhook: jest.fn() }))
      .toThrow(PaymentGatewayContractError);
  });

  test('selects the configured adapter and returns the shared interface', () => {
    const createFakeAdapter = jest.fn(() => fakeGateway);
    const gateway = createPaymentGateway({
      env: { PAYMENT_PROVIDER: 'fake' },
      adapters: { fake: createFakeAdapter },
    });

    expect(createFakeAdapter).toHaveBeenCalledWith({
      env: { PAYMENT_PROVIDER: 'fake' },
      fetchImpl: undefined,
    });
    expect(gateway).toBe(fakeGateway);
  });

  test('fails closed for an unknown provider', () => {
    expect(() => createPaymentGateway({ env: { PAYMENT_PROVIDER: 'unknown' } }))
      .toThrow('Unsupported payment gateway provider: unknown.');
  });
});
