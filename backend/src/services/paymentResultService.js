const { createPaymentGateway } = require('../payments/createPaymentGateway');
const PaymentResultRepository = require('../repositories/paymentResultRepository');

const ORDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const SAFE_PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PAYMENT_RESULT_STATUSES = new Set(['succeeded', 'failed', 'pending']);
const verifiedResults = new WeakSet();

class PaymentResultError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PaymentResultError';
    this.code = code;
  }
}

const getPaymentProvider = (env = process.env) => (env.PAYMENT_PROVIDER || 'momo').trim().toLowerCase();

const validateGatewayResult = (provider, result) => {
  if (!PROVIDER_PATTERN.test(provider)) {
    throw new PaymentResultError('PAYMENT_PROVIDER_INVALID', 'Payment provider is invalid.');
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)
    || !ORDER_ID_PATTERN.test(result.orderId || '')
    || result.gatewayRequestId !== result.orderId
    || !SAFE_PROVIDER_ID_PATTERN.test(result.providerEventId || '')
    || !Number.isSafeInteger(result.amountMinor) || result.amountMinor <= 0
    || !/^[A-Z]{3}$/.test(result.currency || '')
    || !PAYMENT_RESULT_STATUSES.has(result.status)
    || typeof result.occurredAt !== 'string'
    || Number.isNaN(Date.parse(result.occurredAt))
    || new Date(result.occurredAt).toISOString() !== result.occurredAt) {
    throw new PaymentResultError('PAYMENT_RESULT_INVALID', 'Gateway payment result is invalid.');
  }

  if (result.status === 'succeeded'
    && !SAFE_PROVIDER_ID_PATTERN.test(result.gatewayTransactionId || '')) {
    throw new PaymentResultError('PAYMENT_TRANSACTION_ID_INVALID',
      'Successful gateway result has no valid transaction ID.');
  }
  if (result.gatewayTransactionId !== null && result.gatewayTransactionId !== undefined
    && !SAFE_PROVIDER_ID_PATTERN.test(result.gatewayTransactionId)) {
    throw new PaymentResultError('PAYMENT_TRANSACTION_ID_INVALID', 'Gateway transaction ID is invalid.');
  }

  return Object.freeze({
    provider,
    providerEventId: result.providerEventId,
    orderId: result.orderId,
    gatewayRequestId: result.gatewayRequestId,
    gatewayTransactionId: result.gatewayTransactionId || null,
    amountMinor: result.amountMinor,
    currency: result.currency,
    status: result.status,
    occurredAt: result.occurredAt,
  });
};

const isExpired = (order, databaseNow) => {
  const expiresAt = new Date(order.expires_at).getTime();
  const now = new Date(databaseNow).getTime();
  return !Number.isFinite(expiresAt) || !Number.isFinite(now) || expiresAt <= now;
};

const createPaymentResultService = ({
  repository = PaymentResultRepository,
  gatewayFactory = createPaymentGateway,
  env = process.env,
} = {}) => {
  let gateway;
  const resolveGateway = () => {
    if (!gateway) gateway = gatewayFactory({ env });
    return gateway;
  };

  const markForReview = async (context, verifiedResult, errorCode) => {
    await repository.markNeedsReview(context.transaction, {
      orderId: context.order.id,
      gatewayTransactionId: verifiedResult.gatewayTransactionId,
      errorCode,
    });
    return {
      status: 'needs_review',
      orderId: context.order.id,
      gatewayTransactionId: verifiedResult.gatewayTransactionId,
      reason: errorCode,
    };
  };

  const applyToLockedOrder = async (context, verifiedResult) => {
    const { order, allocations, hold, databaseNow } = context;
    if (!order) return { status: 'ignored', reason: 'ORDER_NOT_FOUND' };

    if (order.gateway_provider !== verifiedResult.provider
      || order.gateway_request_id !== verifiedResult.gatewayRequestId
      || order.id !== verifiedResult.orderId) {
      throw new PaymentResultError('PAYMENT_RESULT_CORRELATION_INVALID',
        'Gateway result does not match the stored payment request.');
    }

    if (order.status === 'paid') {
      if (verifiedResult.status !== 'succeeded') {
        return { status: 'paid', orderId: order.id, duplicate: true };
      }
      if (order.gateway_transaction_id === verifiedResult.gatewayTransactionId) {
        return { status: 'duplicate', orderId: order.id, gatewayTransactionId: verifiedResult.gatewayTransactionId };
      }
      return { status: 'anomaly', orderId: order.id, reason: 'DIFFERENT_TRANSACTION_FOR_PAID_ORDER' };
    }
    if (order.status === 'needs_review') {
      return { status: 'needs_review', orderId: order.id, reason: order.payment_error_code || 'ALREADY_NEEDS_REVIEW' };
    }
    if (verifiedResult.status === 'pending') {
      if (order.status === 'pending') {
        await repository.recordGatewayResult(context.transaction, { orderId: order.id, status: 'pending' });
      }
      return { status: 'processing', orderId: order.id };
    }
    if (verifiedResult.status === 'failed') {
      if (order.status === 'pending') {
        await repository.recordGatewayResult(context.transaction, { orderId: order.id, status: 'failed' });
      }
      return { status: 'failed', orderId: order.id };
    }

    if (order.status === 'cancelled' || order.status === 'expired' || isExpired(order, databaseNow)) {
      return markForReview(context, verifiedResult, 'LATE_PAYMENT_SUCCESS');
    }
    if (order.status !== 'pending') {
      return markForReview(context, verifiedResult, 'ORDER_STATE_UNEXPECTED');
    }

    await repository.recordGatewayResult(context.transaction, { orderId: order.id, status: 'succeeded' });
    if (order.total_amount !== verifiedResult.amountMinor) {
      return markForReview(context, verifiedResult, 'PAYMENT_AMOUNT_MISMATCH');
    }
    if (order.currency !== verifiedResult.currency) {
      return markForReview(context, verifiedResult, 'PAYMENT_CURRENCY_MISMATCH');
    }

    const showtimeIds = new Set(allocations.map((allocation) => allocation.showtimeId));
    const allocationIsValid = allocations.length > 0
      && allocations.every((allocation) => allocation.releasedAt === null)
      && showtimeIds.size === 1
      && hold
      && hold.order_id === order.id
      && hold.user_id === order.user_id
      && hold.status === 'pending_payment'
      && hold.showtime_id === allocations[0].showtimeId
      && Number(hold.quantity) === allocations.length
      && !isExpired({ expires_at: hold.expires_at }, databaseNow);
    if (!allocationIsValid) {
      return markForReview(context, verifiedResult, 'PAYMENT_ALLOCATION_MISMATCH');
    }

    await repository.markPaid(context.transaction, {
      orderId: order.id,
      gatewayTransactionId: verifiedResult.gatewayTransactionId,
    });
    await repository.deletePaymentHold(context.transaction, { hold });
    // S-25: vé được phát cùng commit với trạng thái paid; thiếu vé thì rollback cả thanh toán.
    const issued = await repository.issueTickets(context.transaction, { orderId: order.id });
    if (issued !== allocations.length) {
      throw new PaymentResultError('TICKET_ISSUE_FAILED', 'Could not issue one ticket per paid seat.');
    }

    return {
      status: 'paid',
      orderId: order.id,
      gatewayTransactionId: verifiedResult.gatewayTransactionId,
    };
  };

  return {
    /**
     * Verify the raw server-to-server webhook with the provider adapter.
     * S-20 should call this before opening its event transaction.
     */
    async verifyWebhook({ rawBody, headers = {} }) {
      if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
        throw new PaymentResultError('INVALID_WEBHOOK', 'A raw webhook body is required.');
      }
      const paymentGateway = resolveGateway();
      const verifiedWebhook = await paymentGateway.verifyWebhook({ rawBody, headers });
      const result = await paymentGateway.readResult(verifiedWebhook);
      const verifiedResult = validateGatewayResult(getPaymentProvider(env), result);
      verifiedResults.add(verifiedResult);
      return verifiedResult;
    },

    /**
     * Apply a verified result. When S-20 supplies its transaction, its
     * payment_events insert and this order/seat/hold transition share one commit.
     */
    async applyVerifiedResult(verifiedResult, { transaction } = {}) {
      if (!verifiedResults.has(verifiedResult)) {
        throw new PaymentResultError('PAYMENT_RESULT_UNVERIFIED',
          'Only a result verified by the gateway adapter can change an order.');
      }
      const outcome = await repository.withLockedOrder({
        orderId: verifiedResult.orderId,
        transaction,
        operation: (context) => applyToLockedOrder(context, verifiedResult),
      });
      if (outcome && outcome.status === 'paid' && !outcome.duplicate && process.env.NODE_ENV !== 'test') {
        setImmediate(() => {
          try {
            const { sendTicketEmailForOrder } = require('./ticketNotificationService');
            sendTicketEmailForOrder(verifiedResult.orderId).catch(() => {});
          } catch {
            // Ignore in tests
          }
        });
      }
      return outcome;
    },
  };
};

module.exports = {
  ORDER_ID_PATTERN,
  PaymentResultError,
  SAFE_PROVIDER_ID_PATTERN,
  createPaymentResultService,
  getPaymentProvider,
  validateGatewayResult,
};
