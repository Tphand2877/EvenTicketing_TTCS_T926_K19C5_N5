const { assertPaymentGateway } = require('./IPaymentGateway');
const { createMoMoGatewayFromEnv } = require('./adapters/MoMoGateway');

const DEFAULT_ADAPTERS = Object.freeze({
  momo: createMoMoGatewayFromEnv,
});

const createPaymentGateway = ({ env = process.env, adapters = DEFAULT_ADAPTERS, fetchImpl } = {}) => {
  const provider = (env.PAYMENT_PROVIDER || 'momo').trim().toLowerCase();
  const createAdapter = adapters[provider];
  if (typeof createAdapter !== 'function') {
    throw new Error(`Unsupported payment gateway provider: ${provider || '(empty)'}.`);
  }

  return assertPaymentGateway(createAdapter({ env, fetchImpl }));
};

module.exports = { DEFAULT_ADAPTERS, createPaymentGateway };
