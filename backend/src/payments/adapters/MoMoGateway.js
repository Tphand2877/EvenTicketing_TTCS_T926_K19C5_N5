const crypto = require('crypto');
const { PaymentGatewayError } = require('../IPaymentGateway');
const { readMomoConfig } = require('../../config/paymentGateway');

const CREATE_ENDPOINT = '/v2/gateway/api/create';
const REQUEST_TYPE = 'captureWallet';
const MIN_AMOUNT_VND = 1000;
const MAX_AMOUNT_VND = 50000000;
const RAW_BODY_LIMIT = 64 * 1024;
const PENDING_RESULT_CODES = new Set([1000, 7000, 7002]);
const VERIFIED_MOMO_WEBHOOK = Symbol('verified-momo-webhook');

const sign = (secretKey, value) => crypto.createHmac('sha256', secretKey).update(value, 'utf8').digest('hex');

const safeEqualHex = (actual, expected) => {
  if (typeof actual !== 'string' || !/^[a-f\d]{64}$/i.test(actual)) return false;
  const actualBytes = Buffer.from(actual, 'hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  return actualBytes.length === expectedBytes.length && crypto.timingSafeEqual(actualBytes, expectedBytes);
};

const hasValue = (value) => value !== undefined && value !== null;
const canonicalValue = (value) => (hasValue(value) ? String(value) : '');

const createRequestSignatureData = ({ accessKey, amount, extraData, ipnUrl, orderId, orderInfo, partnerCode, redirectUrl, requestId }) => (
  `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${ipnUrl}`
  + `&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}`
  + `&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=${REQUEST_TYPE}`
);

const createResponseSignatureData = (result, accessKey) => (
  `accessKey=${accessKey}&amount=${canonicalValue(result.amount)}`
  + `&message=${canonicalValue(result.message)}&orderId=${canonicalValue(result.orderId)}`
  + `&partnerCode=${canonicalValue(result.partnerCode)}&payUrl=${canonicalValue(result.payUrl)}`
  + `&requestId=${canonicalValue(result.requestId)}&responseTime=${canonicalValue(result.responseTime)}`
  + `&resultCode=${canonicalValue(result.resultCode)}`
);

const createWebhookSignatureData = (payload, accessKey) => (
  `accessKey=${accessKey}&amount=${canonicalValue(payload.amount)}`
  + `&extraData=${canonicalValue(payload.extraData)}&message=${canonicalValue(payload.message)}`
  + `&orderId=${canonicalValue(payload.orderId)}&orderInfo=${canonicalValue(payload.orderInfo)}`
  + `&orderType=${canonicalValue(payload.orderType)}&partnerCode=${canonicalValue(payload.partnerCode)}`
  + `&payType=${canonicalValue(payload.payType)}&requestId=${canonicalValue(payload.requestId)}`
  + `&responseTime=${canonicalValue(payload.responseTime)}&resultCode=${canonicalValue(payload.resultCode)}`
  + `&transId=${canonicalValue(payload.transId)}`
);

const isSafeId = (value) => typeof value === 'string'
  && value.length > 0 && value.length <= 50
  && /^[0-9a-zA-Z]([-_.]*[0-9a-zA-Z]+)*$/.test(value);

const validAmount = (amount) => Number.isSafeInteger(amount)
  && amount >= MIN_AMOUNT_VND && amount <= MAX_AMOUNT_VND;

const parseJsonResponse = async (response) => {
  try {
    return await response.json();
  } catch {
    throw new PaymentGatewayError('PROVIDER_RESPONSE_INVALID', 'MoMo returned an invalid response.');
  }
};

const createMoMoGateway = ({ config, fetchImpl = globalThis.fetch }) => {
  if (!config || !config.partnerCode || !config.accessKey || !config.secretKey
    || !config.apiBaseUrl || !config.redirectUrl || !config.ipnUrl) {
    throw new Error('MoMo gateway configuration is incomplete.');
  }
  if (typeof fetchImpl !== 'function') throw new Error('This Node.js runtime must provide fetch.');

  const verifyProviderSignature = (payload, signature, canonicalData) => {
    if (payload.partnerCode !== config.partnerCode
      || !safeEqualHex(signature, sign(config.secretKey, canonicalData))) {
      throw new PaymentGatewayError('INVALID_SIGNATURE', 'MoMo signature verification failed.');
    }
  };

  return {
    async createPayment(input) {
      const normalizedInput = input || {};
      const {
        orderId,
        amountMinor,
        currency,
        orderInfo = `Ticket order ${normalizedInput.orderId}`,
      } = normalizedInput;
      if (!isSafeId(orderId)) {
        throw new PaymentGatewayError('INVALID_PAYMENT_REQUEST', 'MoMo order ID is invalid.');
      }
      if (!validAmount(amountMinor) || currency !== 'VND') {
        throw new PaymentGatewayError('INVALID_PAYMENT_REQUEST', 'MoMo requires a VND amount from 1,000 to 50,000,000.');
      }
      if (typeof orderInfo !== 'string' || orderInfo.length === 0 || orderInfo.length > 255) {
        throw new PaymentGatewayError('INVALID_PAYMENT_REQUEST', 'MoMo order information is invalid.');
      }

      // T-41 uses the order UUID as its stable gateway request ID.
      const requestId = orderId;
      const request = {
        partnerCode: config.partnerCode,
        requestId,
        amount: amountMinor,
        orderId,
        orderInfo,
        redirectUrl: config.redirectUrl,
        ipnUrl: config.ipnUrl,
        requestType: REQUEST_TYPE,
        extraData: '',
        autoCapture: true,
        lang: 'vi',
      };
      request.signature = sign(config.secretKey, createRequestSignatureData({
        accessKey: config.accessKey,
        amount: request.amount,
        extraData: request.extraData,
        ipnUrl: request.ipnUrl,
        orderId: request.orderId,
        orderInfo: request.orderInfo,
        partnerCode: request.partnerCode,
        redirectUrl: request.redirectUrl,
        requestId: request.requestId,
      }));

      let response;
      try {
        response = await fetchImpl(`${config.apiBaseUrl}${CREATE_ENDPOINT}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(35000),
        });
      } catch {
        throw new PaymentGatewayError('PROVIDER_UNAVAILABLE', 'Could not reach MoMo.');
      }
      if (!response.ok) throw new PaymentGatewayError('PROVIDER_UNAVAILABLE', 'MoMo rejected the payment request.');

      const result = await parseJsonResponse(response);
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new PaymentGatewayError('PROVIDER_RESPONSE_INVALID', 'MoMo returned an invalid response.');
      }
      verifyProviderSignature(result, result.signature, createResponseSignatureData(result, config.accessKey));
      if (Number(result.resultCode) !== 0
        || result.orderId !== orderId || result.requestId !== requestId
        || Number(result.amount) !== amountMinor) {
        throw new PaymentGatewayError('PROVIDER_REQUEST_REJECTED', 'MoMo did not accept the payment request.');
      }

      let redirect;
      try {
        redirect = new URL(result.payUrl);
      } catch {
        throw new PaymentGatewayError('PROVIDER_RESPONSE_INVALID', 'MoMo returned an invalid payment URL.');
      }
      const apiOrigin = new URL(config.apiBaseUrl).origin;
      if (redirect.protocol !== 'https:' || redirect.origin !== apiOrigin || redirect.pathname !== '/v2/gateway/pay') {
        throw new PaymentGatewayError('PROVIDER_RESPONSE_INVALID', 'MoMo returned an unexpected payment URL.');
      }

      return { redirectUrl: redirect.toString(), gatewayRequestId: requestId };
    },

    async verifyWebhook({ rawBody }) {
      if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || rawBody.length > RAW_BODY_LIMIT) {
        throw new PaymentGatewayError('INVALID_WEBHOOK', 'MoMo webhook body is invalid.');
      }

      let payload;
      try {
        payload = JSON.parse(rawBody.toString('utf8'));
      } catch {
        throw new PaymentGatewayError('INVALID_WEBHOOK', 'MoMo webhook body is invalid.');
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new PaymentGatewayError('INVALID_WEBHOOK', 'MoMo webhook body is invalid.');
      }

      const requiredFields = [
        'amount', 'extraData', 'message', 'orderId', 'orderInfo', 'orderType', 'partnerCode',
        'payType', 'requestId', 'responseTime', 'resultCode', 'signature',
      ];
      if (requiredFields.some((field) => !hasValue(payload[field]))) {
        throw new PaymentGatewayError('INVALID_WEBHOOK', 'MoMo webhook is missing required fields.');
      }
      const stringFields = ['extraData', 'message', 'orderInfo', 'orderType', 'partnerCode', 'payType', 'signature'];
      if (stringFields.some((field) => typeof payload[field] !== 'string')) {
        throw new PaymentGatewayError('INVALID_WEBHOOK', 'MoMo webhook fields are invalid.');
      }
      verifyProviderSignature(payload, payload.signature, createWebhookSignatureData(payload, config.accessKey));

      if (!isSafeId(payload.orderId) || !isSafeId(payload.requestId)
        || !Number.isSafeInteger(Number(payload.amount)) || Number(payload.amount) <= 0
        || !Number.isSafeInteger(Number(payload.resultCode))
        || !Number.isSafeInteger(Number(payload.responseTime))) {
        throw new PaymentGatewayError('INVALID_WEBHOOK', 'MoMo webhook fields are invalid.');
      }

      return { [VERIFIED_MOMO_WEBHOOK]: true, payload };
    },

    async readResult(verifiedWebhook) {
      const payload = verifiedWebhook?.payload;
      if (!verifiedWebhook?.[VERIFIED_MOMO_WEBHOOK] || !payload || payload.partnerCode !== config.partnerCode) {
        throw new PaymentGatewayError('INVALID_WEBHOOK', 'MoMo result has not been verified.');
      }
      const resultCode = Number(payload.resultCode);
      const responseTime = Number(payload.responseTime);
      const occurredAt = new Date(responseTime);
      if (Number.isNaN(occurredAt.getTime())) {
        throw new PaymentGatewayError('PROVIDER_RESPONSE_INVALID', 'MoMo result time is invalid.');
      }

      const status = resultCode === 0 || resultCode === 9000
        ? 'succeeded'
        : (PENDING_RESULT_CODES.has(resultCode) ? 'pending' : 'failed');
      const transactionId = hasValue(payload.transId) && String(payload.transId) !== '0'
        ? String(payload.transId)
        : null;
      const fallbackEventId = `${payload.orderId}:${payload.requestId}:${resultCode}:${responseTime}`;

      return {
        providerEventId: transactionId || fallbackEventId,
        orderId: payload.orderId,
        gatewayRequestId: payload.requestId,
        gatewayTransactionId: transactionId,
        amountMinor: Number(payload.amount),
        currency: 'VND',
        status,
        occurredAt: occurredAt.toISOString(),
      };
    },
  };
};

const createMoMoGatewayFromEnv = ({ env = process.env, fetchImpl } = {}) => createMoMoGateway({
  config: readMomoConfig(env),
  fetchImpl,
});

module.exports = {
  MAX_AMOUNT_VND,
  MIN_AMOUNT_VND,
  PENDING_RESULT_CODES,
  REQUEST_TYPE,
  createMoMoGateway,
  createMoMoGatewayFromEnv,
  createRequestSignatureData,
  createResponseSignatureData,
  createWebhookSignatureData,
  sign,
};
