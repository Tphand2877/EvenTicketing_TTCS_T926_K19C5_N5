const db = require('../config/database');

const findById = (id) => db('orders')
  .select('*', db.raw('clock_timestamp() AS database_now'))
  .where({ id })
  .first();

// This single conditional UPDATE is the claim. PostgreSQL rechecks its WHERE
// clause after a concurrent updater commits, so only one caller may proceed.
const claimPaymentRequest = async ({ orderId, userId, amountMinor, currency, provider }) => {
  const rows = await db('orders')
    .where({
      id: orderId,
      user_id: userId,
      status: 'pending',
      total_amount: amountMinor,
      currency,
    })
    .andWhere('expires_at', '>', db.raw('clock_timestamp()'))
    .whereNull('gateway_provider')
    .whereNull('gateway_request_id')
    .update({
      gateway_provider: provider,
      gateway_request_id: orderId,
      payment_request_status: 'processing',
      payment_request_started_at: db.raw('clock_timestamp()'),
      payment_error_code: null,
      updated_at: db.raw('clock_timestamp()'),
    })
    .returning(['id']);

  return rows.length === 1;
};

const storePaymentUrl = async ({ orderId, userId, provider, gatewayRequestId, redirectUrl }) => {
  const rows = await db('orders')
    .where({
      id: orderId,
      user_id: userId,
      status: 'pending',
      gateway_provider: provider,
      gateway_request_id: gatewayRequestId,
    })
    .andWhere('expires_at', '>', db.raw('clock_timestamp()'))
    .update({
      payment_url: redirectUrl,
      payment_request_status: 'ready',
      payment_error_code: null,
      updated_at: db.raw('clock_timestamp()'),
    })
    .returning(['id']);

  return rows.length === 1;
};

const markPaymentRequestIndeterminate = async ({ orderId, provider, gatewayRequestId, errorCode }) => {
  const rows = await db('orders')
    .where({
      id: orderId,
      status: 'pending',
      gateway_provider: provider,
      gateway_request_id: gatewayRequestId,
    })
    .whereNull('payment_url')
    .update({
      payment_request_status: 'indeterminate',
      payment_error_code: errorCode,
      updated_at: db.raw('clock_timestamp()'),
    })
    .returning(['id']);

  return rows.length === 1;
};

module.exports = { findById, claimPaymentRequest, storePaymentUrl, markPaymentRequestIndeterminate };
