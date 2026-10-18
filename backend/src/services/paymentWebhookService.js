const { createPaymentEventRepository } = require('../models/PaymentEvent');

class PaymentWebhookError extends Error {
  constructor(code, status = 400) {
    super('Payment webhook could not be processed.');
    this.code = code;
    this.status = status;
  }
}
const isId = (value) => typeof value === 'string' && /^[\x21-\x7e]{1,128}$/.test(value);
const forbiddenFields = new Set([
  'card', 'cardnumber', 'creditcardnumber', 'debitcardnumber', 'primaryaccountnumber',
  'pan', 'ccnumber', 'cvv', 'cvc', 'securitycode', 'cardsecuritycode',
]);
const validateWebhook = (event) => {
  if (!event || !isId(event.transactionId) || !isId(event.orderId)) {
    throw new PaymentWebhookError('INVALID_EVENT');
  }
  if (typeof event.rawPayload !== 'string' || Buffer.byteLength(event.rawPayload, 'utf8') > 65536) {
    throw new PaymentWebhookError('INVALID_PAYLOAD');
  }
  let payload;
  try { payload = JSON.parse(event.rawPayload); }
  catch { throw new PaymentWebhookError('INVALID_PAYLOAD'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new PaymentWebhookError('INVALID_PAYLOAD');
  }
  const pending = [{ value: payload, depth: 0 }];
  while (pending.length) {
    const { value, depth } = pending.pop();
    if (depth > 32) throw new PaymentWebhookError('INVALID_PAYLOAD');
    for (const [key, child] of Object.entries(value)) {
      const field = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (forbiddenFields.has(field) || /(?:cardnumber|primaryaccountnumber|pan|cvv|cvc|securitycode)$/.test(field)) {
        throw new PaymentWebhookError('CARD_DATA_NOT_ALLOWED');
      }
      if (child !== null && typeof child === 'object') pending.push({ value: child, depth: depth + 1 });
    }
  }
};

/** T-46 records once, then delegates all order/payment/seat decisions to the team's T-42. */
const createPaymentWebhookService = ({ repository = createPaymentEventRepository(), paymentResults } = {}) => {
  if (typeof paymentResults?.applyVerifiedResult !== 'function') {
    throw new Error('Payment webhook requires the T-42 result service.');
  }
  return {
    async handle({ verifiedResult, rawPayload } = {}) {
      const input = { transactionId: verifiedResult?.gatewayTransactionId || verifiedResult?.providerEventId,
        orderId: verifiedResult?.orderId, rawPayload };
      validateWebhook(input);
      return repository.processOnce(input, async (transaction) => {
        // Keep the exact T-42 verification token. Cloning/serializing loses its trust identity.
        const result = await paymentResults.applyVerifiedResult(verifiedResult, { transaction });
        if (!['paid', 'duplicate', 'needs_review', 'anomaly', 'processing', 'failed', 'ignored'].includes(result?.status)) {
          throw new Error('T-42 returned an invalid outcome.');
        }
        const review = ['needs_review', 'anomaly'].includes(result.status);
        const reason = typeof result.reason === 'string' && /^[A-Z0-9_]{1,40}$/.test(result.reason)
          ? result.reason : undefined;
        return { outcome: review ? (reason === 'LATE_PAYMENT_SUCCESS' ? 'refund_review' : 'needs_review') : 'processed',
          reviewReason: reason };
      });
    },
  };
};
module.exports = { PaymentWebhookError, validateWebhook, createPaymentWebhookService };
