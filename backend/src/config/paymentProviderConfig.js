const DEPLOYMENTS = new Set(['development', 'test', 'staging', 'production']);
const PROVIDERS = new Set(['momo', 'mock']);

class PaymentConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PaymentConfigurationError';
    this.code = 'PAYMENT_CONFIGURATION_INVALID';
  }
}

const readPaymentProviderConfig = (env = process.env) => {
  if (env.PAYMENT_GATEWAY !== undefined) {
    throw new PaymentConfigurationError('PAYMENT_GATEWAY is obsolete; configure PAYMENT_PROVIDER only.');
  }
  const deployment = env.DEPLOY_ENV?.trim().toLowerCase()
    || (env.NODE_ENV === 'test' ? 'test' : env.NODE_ENV === 'production' ? null : 'development');
  if (!deployment || !DEPLOYMENTS.has(deployment)) {
    throw new PaymentConfigurationError('DEPLOY_ENV must be development, test, staging, or production.');
  }
  const configured = env.PAYMENT_PROVIDER?.trim().toLowerCase();
  // Máy dev chưa có khoá MoMo vẫn phải chạy được: mặc định dùng cổng thử (mock) ngoài production.
  const provider = configured || (deployment === 'production' ? null : 'mock');
  if (!provider || !PROVIDERS.has(provider)) {
    throw new PaymentConfigurationError('PAYMENT_PROVIDER must be momo or mock; production requires explicit momo.');
  }
  if (deployment === 'production' && provider !== 'momo') {
    throw new PaymentConfigurationError('Mock payment gateway is forbidden in production.');
  }
  return Object.freeze({ deployment, provider });
};

module.exports = { PaymentConfigurationError, readPaymentProviderConfig };
