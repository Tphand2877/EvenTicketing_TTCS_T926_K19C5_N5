const Order = require('../models/Order');
const { createPaymentGateway } = require('../payments/createPaymentGateway');
const { readPaymentProviderConfig } = require('../config/paymentProviderConfig');

const ORDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_CLAIM_STALE_MS = 2 * 60 * 1000;
const PROCESSING_RETRY_AFTER_SECONDS = 3;

class PaymentServiceError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'PaymentServiceError';
    this.code = code;
    if (details) this.details = details;
  }
}

const getPaymentProvider = (env = process.env) => readPaymentProviderConfig(env).provider;

const isSafeRedirectUrl = (value, env = process.env) => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const { deployment } = readPaymentProviderConfig(env);
    const localHttp = url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      && ['development', 'test'].includes(deployment);
    return (url.protocol === 'https:' || localHttp) && !url.username && !url.password;
  } catch {
    return false;
  }
};

const createPaymentService = ({
  orders = Order,
  gatewayFactory = createPaymentGateway,
  gateway: selectedGateway,
  env = process.env,
  now = () => new Date(),
} = {}) => {
  let gateway = selectedGateway;
  const resolveGateway = () => {
    if (!gateway) gateway = gatewayFactory({ env });
    return gateway;
  };

  const assertOrderNotExpired = (order) => {
    const databaseNow = order.database_now ? new Date(order.database_now) : now();
    if (!order.expires_at || new Date(order.expires_at) <= databaseNow) {
      throw new PaymentServiceError('ORDER_EXPIRED', 'Đơn hàng đã hết hạn thanh toán.');
    }
  };

  const findOwnedOrder = async ({ orderId, userId }) => {
    if (typeof orderId !== 'string' || orderId.length > 128 || !ORDER_ID_PATTERN.test(orderId)) {
      throw new PaymentServiceError('INVALID_ORDER_ID', 'Mã đơn hàng không hợp lệ.');
    }

    const order = await orders.findById(orderId);
    if (!order) throw new PaymentServiceError('ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.');
    if (String(order.user_id) !== String(userId)) {
      throw new PaymentServiceError('ORDER_FORBIDDEN', 'Bạn không có quyền xem hoặc thanh toán đơn hàng này.');
    }
    return order;
  };

  const findOwnedPendingOrder = async ({ orderId, userId }) => {
    const order = await findOwnedOrder({ orderId, userId });
    if (order.status === 'expired') {
      throw new PaymentServiceError('ORDER_EXPIRED', 'Đơn hàng đã hết hạn thanh toán.');
    }
    if (order.status === 'paid') {
      throw new PaymentServiceError('ORDER_ALREADY_PAID', 'Đơn hàng đã được thanh toán.');
    }
    if (order.status !== 'pending') {
      throw new PaymentServiceError('ORDER_NOT_PAYABLE', 'Đơn hàng hiện không thể thanh toán.');
    }
    assertOrderNotExpired(order);
    return order;
  };

  const getClaimStartedAt = (order) => order.payment_request_started_at || order.updated_at;

  const isClaimStale = (order) => {
    const startedAt = getClaimStartedAt(order);
    if (!startedAt) return true;
    const startedMs = new Date(startedAt).getTime();
    const currentMs = new Date(order.database_now || now()).getTime();
    return !Number.isFinite(startedMs) || !Number.isFinite(currentMs)
      || currentMs - startedMs >= PAYMENT_CLAIM_STALE_MS;
  };

  const markIndeterminate = async (order, errorCode) => {
    try {
      await orders.markPaymentRequestIndeterminate({
        orderId: order.id,
        provider: order.gateway_provider,
        gatewayRequestId: order.gateway_request_id,
        errorCode,
      });
    } catch {
      // Keep the claim. A later status read will classify an old processing
      // claim as indeterminate even if this update could not be saved.
    }
  };

  const reconciliationRequired = (order) => new PaymentServiceError(
    'PAYMENT_RECONCILIATION_REQUIRED',
    'Chưa xác định được kết quả thanh toán. Mã yêu cầu cần được đối soát trước khi thử lại.',
    { orderId: order.id, gatewayRequestId: order.gateway_request_id, status: 'indeterminate' },
  );

  const resolveClaimState = async (order) => {
    if (order.payment_url) {
      if (isSafeRedirectUrl(order.payment_url, env)) {
        return {
          status: 'ready',
          orderId: order.id,
          amountMinor: order.total_amount,
          currency: order.currency,
          gatewayRequestId: order.gateway_request_id,
          redirectUrl: order.payment_url,
        };
      }
      await markIndeterminate(order, 'INVALID_STORED_PAYMENT_URL');
      throw reconciliationRequired(order);
    }

    if (order.payment_request_status === 'indeterminate' || order.payment_request_status === 'ready'
      || isClaimStale(order)) {
      if (order.payment_request_status !== 'indeterminate') {
        await markIndeterminate(order, order.payment_error_code || 'CLAIM_TIMEOUT');
      }
      throw reconciliationRequired(order);
    }

    return {
      status: 'processing',
      orderId: order.id,
      amountMinor: order.total_amount,
      currency: order.currency,
      gatewayRequestId: order.gateway_request_id,
      retryAfterSeconds: PROCESSING_RETRY_AFTER_SECONDS,
    };
  };

  const assertSameClaim = (order, provider) => {
    if (order.gateway_provider !== provider || order.gateway_request_id !== order.id) {
      throw new PaymentServiceError('PAYMENT_PROVIDER_MISMATCH',
        'Đơn hàng đã có yêu cầu thanh toán từ một cổng khác.');
    }
  };

  const responseForStoredOrder = async (order, provider) => {
    assertSameClaim(order, provider);
    if (order.gateway_result_status === 'failed') {
      return { status: 'failed', orderId: order.id };
    }
    if (order.gateway_result_status === 'pending') {
      return { status: 'processing', orderId: order.id, retryAfterSeconds: PROCESSING_RETRY_AFTER_SECONDS };
    }
    return resolveClaimState(order);
  };

  const responseForFreshOrder = async ({ orderId, userId, provider }) => {
    const order = await findOwnedPendingOrder({ orderId, userId });
    assertSameClaim(order, provider);
    return order;
  };

  const validateGatewayResponse = (payment, order) => (
    payment && payment.gatewayRequestId === order.id && isSafeRedirectUrl(payment.redirectUrl, env)
  );

  return {
    async createPayment({ orderId, userId }) {
      const order = await findOwnedPendingOrder({ orderId, userId });

      if (!Number.isSafeInteger(order.total_amount) || order.total_amount <= 0 || order.currency !== 'VND') {
        throw new PaymentServiceError('ORDER_TOTAL_INVALID', 'Tổng tiền đơn hàng không hợp lệ.');
      }

      const provider = getPaymentProvider(env);
      if (order.gateway_request_id) {
        return responseForStoredOrder(order, provider);
      }
      if (order.gateway_provider) {
        throw new PaymentServiceError('PAYMENT_PROVIDER_MISMATCH',
          'Đơn hàng đã có yêu cầu thanh toán từ một cổng khác.');
      }

      if (provider === 'momo' && (order.total_amount < 1000 || order.total_amount > 50000000)) {
        throw new PaymentServiceError('PAYMENT_AMOUNT_UNSUPPORTED',
          'Cổng thanh toán không hỗ trợ số tiền của đơn hàng.');
      }

      const paymentGateway = resolveGateway();
      const claimed = await orders.claimPaymentRequest({
        orderId: order.id,
        userId,
        amountMinor: order.total_amount,
        currency: order.currency,
        provider,
      });
      if (!claimed) {
        const current = await findOwnedPendingOrder({ orderId: order.id, userId });
        if (current.gateway_request_id) return responseForStoredOrder(current, provider);
        throw new PaymentServiceError('ORDER_STATE_CHANGED',
          'Trạng thái đơn hàng đã thay đổi. Hãy tải lại đơn trước khi thanh toán.');
      }

      let payment;
      try {
        payment = await paymentGateway.createPayment({
          orderId: order.id,
          amountMinor: order.total_amount,
          currency: order.currency,
          orderInfo: `Ticket order ${order.id}`,
        });
      } catch (error) {
        const safeErrorCode = typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
          ? error.code
          : 'PROVIDER_OUTCOME_UNKNOWN';
        await markIndeterminate({ ...order, gateway_provider: provider, gateway_request_id: order.id }, safeErrorCode);
        if (error?.code === 'INVALID_PAYMENT_REQUEST') {
          throw new PaymentServiceError('PAYMENT_AMOUNT_UNSUPPORTED',
            'Cổng thanh toán không hỗ trợ số tiền của đơn hàng.');
        }
        throw new PaymentServiceError('PAYMENT_GATEWAY_UNAVAILABLE',
          'Chưa xác định được trạng thái yêu cầu thanh toán. Mã yêu cầu cần được đối soát.',
          { orderId: order.id, gatewayRequestId: order.id, status: 'indeterminate' });
      }

      if (!validateGatewayResponse(payment, order)) {
        await markIndeterminate({ ...order, gateway_provider: provider, gateway_request_id: order.id },
          'INVALID_PROVIDER_RESPONSE');
        throw new PaymentServiceError('PAYMENT_GATEWAY_RESPONSE_INVALID',
          'Cổng thanh toán trả về dữ liệu không hợp lệ. Mã yêu cầu cần được đối soát.',
          { orderId: order.id, gatewayRequestId: order.id, status: 'indeterminate' });
      }

      // Expiry may pass while the provider is responding. Re-read the order
      // using database time before persisting or returning its payment URL.
      await responseForFreshOrder({ orderId: order.id, userId, provider });

      let saved;
      try {
        saved = await orders.storePaymentUrl({
          orderId: order.id,
          userId,
          provider,
          gatewayRequestId: order.id,
          redirectUrl: payment.redirectUrl,
        });
      } catch {
        await markIndeterminate({ ...order, gateway_provider: provider, gateway_request_id: order.id },
          'PAYMENT_URL_PERSIST_FAILED');
        throw new PaymentServiceError('PAYMENT_STATE_PERSIST_FAILED',
          'Yêu cầu đã gửi tới cổng nhưng chưa lưu được đường dẫn. Mã yêu cầu cần được đối soát.',
          { orderId: order.id, gatewayRequestId: order.id, status: 'indeterminate' });
      }

      if (!saved) {
        const current = await responseForFreshOrder({ orderId: order.id, userId, provider });
        return resolveClaimState(current);
      }

      return {
        status: 'ready',
        orderId: order.id,
        amountMinor: order.total_amount,
        currency: order.currency,
        gatewayRequestId: payment.gatewayRequestId,
        redirectUrl: payment.redirectUrl,
      };
    },

    async getPaymentStatus({ orderId, userId }) {
      const order = await findOwnedOrder({ orderId, userId });
      const databaseNow = order.database_now ? new Date(order.database_now) : now();
      const expiresAt = new Date(order.expires_at).getTime();
      const expired = !Number.isFinite(expiresAt) || expiresAt <= new Date(databaseNow).getTime();

      if (order.status === 'paid') return { status: 'paid', orderId: order.id };
      if (order.status === 'needs_review') {
        return { status: 'needs_review', orderId: order.id, gatewayRequestId: order.gateway_request_id };
      }
      if (order.status === 'cancelled') return { status: 'cancelled', orderId: order.id };
      if (order.status === 'expired' || expired) return { status: 'expired', orderId: order.id };
      if (order.status !== 'pending') {
        throw new PaymentServiceError('ORDER_NOT_PAYABLE', 'Đơn hàng hiện không thể thanh toán.');
      }

      if (order.gateway_result_status === 'failed') {
        return { status: 'failed', orderId: order.id };
      }
      if (order.gateway_result_status === 'pending') {
        return { status: 'processing', orderId: order.id, retryAfterSeconds: PROCESSING_RETRY_AFTER_SECONDS };
      }

      if (!order.gateway_request_id && !order.gateway_provider) {
        return { status: 'not_started', orderId: order.id };
      }
      const provider = getPaymentProvider(env);
      return responseForStoredOrder(order, provider);
    },

    /**
     * T-39 / S-17: Lấy tóm tắt chi tiết đơn hàng (sự kiện, suất, từng ghế kèm hạng và đơn giá, tổng tiền, thời gian còn lại)
     */
    async getOrderSummary({ orderId, userId }) {
      if (typeof orderId !== 'string' || orderId.length > 128 || !ORDER_ID_PATTERN.test(orderId)) {
        throw new PaymentServiceError('INVALID_ORDER_ID', 'Mã đơn hàng không hợp lệ.');
      }

      // getOrderDetails có thể do orders (Order model) cung cấp
      const order = orders.getOrderDetails
        ? await orders.getOrderDetails(orderId)
        : await orders.findById(orderId);

      if (!order) throw new PaymentServiceError('ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.');
      if (String(order.user_id) !== String(userId)) {
        throw new PaymentServiceError('ORDER_FORBIDDEN', 'Bạn không có quyền xem đơn hàng này.');
      }

      const databaseNow = order.database_now ? new Date(order.database_now) : now();
      const expiresAt = new Date(order.expires_at).getTime();
      const isExpired = !Number.isFinite(expiresAt) || expiresAt <= new Date(databaseNow).getTime();

      return {
        id: order.id,
        status: isExpired && order.status === 'pending' ? 'expired' : order.status,
        is_expired: isExpired || order.status === 'expired',
        total_amount: order.total_amount,
        currency: order.currency,
        expires_at: order.expires_at,
        server_now: databaseNow.toISOString(),
        event: order.event || null,
        showtime: order.showtime || null,
        items: (order.items || []).map((item) => ({
          id: item.id,
          seat_id: item.seat_id,
          row: item.row_label,
          number: item.seat_number,
          category_name: item.category_name,
          unit_price: item.unit_price,
        })),
      };
    },
  };
};


module.exports = {
  ORDER_ID_PATTERN,
  PAYMENT_CLAIM_STALE_MS,
  PaymentServiceError,
  createPaymentService,
  getPaymentProvider,
};
