/**
 * Provider-neutral payment gateway contract for T-40.
 *
 * @typedef {object} CreatePaymentInput
 * @property {string} orderId Stable merchant order ID; also used as the idempotency key.
 * @property {number} amountMinor Integer amount in the currency's smallest unit.
 * @property {string} currency ISO 4217 currency code.
 * @property {string} orderInfo Short, non-personal description sent to the provider.
 *
 * @typedef {object} CreatePaymentOutput
 * @property {string} redirectUrl Provider-hosted payment URL.
 * @property {string} gatewayRequestId Provider request ID saved for support and reconciliation.
 *
 * @typedef {object} VerifiedWebhook
 * @property {object} payload Provider payload after signature verification.
 *
 * @typedef {object} PaymentResult
 * @property {string} providerEventId Stable provider event ID for duplicate detection.
 * @property {string} orderId Merchant order ID.
 * @property {string} gatewayRequestId Provider request ID correlated to the merchant order.
 * @property {string|null} gatewayTransactionId Provider transaction ID; null for results without one.
 * @property {number} amountMinor Integer amount in the currency's smallest unit.
 * @property {string} currency ISO 4217 currency code.
 * @property {'succeeded'|'failed'|'pending'} status Normalized provider status.
 * @property {string} occurredAt ISO 8601 provider result time.
 *
 * @typedef {object} PaymentGateway
 * @property {(input: CreatePaymentInput) => Promise<CreatePaymentOutput>} createPayment
 * @property {(input: {rawBody: Buffer, headers: object}) => Promise<VerifiedWebhook>} verifyWebhook
 * @property {(input: VerifiedWebhook) => Promise<PaymentResult>} readResult
 */

const REQUIRED_METHODS = ['createPayment', 'verifyWebhook', 'readResult'];

class PaymentGatewayContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PaymentGatewayContractError';
    this.code = 'PAYMENT_GATEWAY_CONTRACT_INVALID';
  }
}

const assertPaymentGateway = (gateway) => {
  if (!gateway || typeof gateway !== 'object') {
    throw new PaymentGatewayContractError('Payment gateway adapter must be an object.');
  }

  const missing = REQUIRED_METHODS.filter((method) => typeof gateway[method] !== 'function');
  if (missing.length > 0) {
    throw new PaymentGatewayContractError(`Payment gateway adapter is missing: ${missing.join(', ')}.`);
  }

  return gateway;
};

class PaymentGatewayError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PaymentGatewayError';
    this.code = code;
  }
}

module.exports = {
  PaymentGatewayContractError,
  PaymentGatewayError,
  assertPaymentGateway,
};
