const { PaymentConfigurationError, readPaymentProviderConfig } = require('./paymentProviderConfig');
const { createPaymentGateway } = require('../payments/createPaymentGateway');
const { createPaymentService } = require('../services/paymentService');
const { createPaymentResultService } = require('../services/paymentResultService');

const createPaymentRuntime = ({ env = process.env } = {}) => {
  const configuration = readPaymentProviderConfig(env);
  let gateway;
  try { gateway = createPaymentGateway({ env, configuration }); }
  catch (error) { throw new PaymentConfigurationError(error.message); }
  return Object.freeze({
    configuration,
    gateway,
    paymentService: createPaymentService({ env, gateway }),
    paymentResultService: createPaymentResultService({ env, gateway }),
  });
};

module.exports = { createPaymentRuntime };
