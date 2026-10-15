const { assertPaymentGateway } = require('./IPaymentGateway');
const { createMoMoGatewayFromEnv } = require('./adapters/MoMoGateway');
const { createMockPaymentGatewayFromEnv } = require('./adapters/MockGateway');
const { readPaymentProviderConfig } = require('../config/paymentProviderConfig');

const DEFAULT_ADAPTERS = Object.freeze({
  momo: createMoMoGatewayFromEnv,
  mock: createMockPaymentGatewayFromEnv,
});

const createPaymentGateway = ({ env = process.env, adapters = DEFAULT_ADAPTERS, fetchImpl, configuration } = {}) => {
  const provider = (configuration || readPaymentProviderConfig(env)).provider;
  const createAdapter = adapters[provider];
  if (typeof createAdapter !== 'function') {
    throw new Error(`Unsupported payment gateway provider: ${provider || '(empty)'}.`);
  }

  return assertPaymentGateway(createAdapter({ env, fetchImpl }));
};

module.exports = { DEFAULT_ADAPTERS, createPaymentGateway };
