# T-42 payment result contract

T-42 validates provider callbacks and applies their business result. S-20 owns the
webhook endpoint, `payment_events`, event deduplication, replay handling, and the
provider acknowledgement response.

## Service boundary

`backend/src/services/paymentResultService.js` exposes:

* `verifyWebhook({ rawBody, headers })` asks the configured gateway adapter to
  verify the signed raw payload, then validates and normalizes the result.
* `applyVerifiedResult(verifiedResult, { transaction })` accepts only a result
  produced by this process's `verifyWebhook` call. It locks the order and its
  seat allocations and applies the result. Pass S-20's PostgreSQL transaction
  so event recording and the order/hold transition share one commit.

The Express JSON parser saves exact request bytes as `req.rawBody` for paths
under `/api/payments/` ending in `/webhook` or `/webhooks`. S-20's route should
pass these bytes to `verifyWebhook`; parsed `req.body` is not a substitute for
signature verification.

## S-20 transaction sequence

1. Verify the raw callback and normalize it with `verifyWebhook`.
2. Begin a PostgreSQL transaction and insert the provider event using S-20's
   unique deduplication key.
3. If the event already exists, skip business processing and return S-20's
   duplicate acknowledgement.
4. Call `applyVerifiedResult(verifiedResult, { transaction: trx })`.
5. Record the returned business outcome on the S-20 event if its schema supports
   that field, then commit both writes.
6. If the service throws, roll back the event insert and business changes. Do
   not acknowledge the callback as processed; allow the provider to retry.

The result token is process-local and must be passed directly from verification
to application in the same request. Do not serialize it for a later worker.
`applyVerifiedResult` also works without a supplied transaction for isolated
callers; in that case it opens its own transaction and cannot include S-20's
event row.

## State outcomes

| Verified result | Stored outcome |
| --- | --- |
| Success, matching amount/currency, live order and allocations | Order becomes `paid`; provider transaction ID and `succeeded` are stored; linked pending-payment hold is deleted in the same transaction. The unreleased order items are the sold seat allocations. |
| Success with amount/currency, expiry, or allocation mismatch | Order becomes `needs_review`; it is not marked paid and the hold is retained for reconciliation. |
| Failed while the order is pending | Order remains pending; `gateway_result_status=failed` is stored. A failed result for a terminal order does not reopen it. |
| Processing while the order is pending | Order remains pending; `gateway_result_status=pending` is stored. |
| Late success for cancelled/expired order | Order becomes `needs_review`; no seat is sold and the hold is not released by T-42. |
| Same success transaction on a paid order | Idempotent duplicate. |
| Different success transaction on a paid order | Returns `anomaly`; S-20 must retain the event for investigation. |
| Any result on a `needs_review` order | Remains `needs_review`; manual reconciliation is required. |

The authenticated `GET /api/payments/orders/:orderId` reads stored backend state.
Query parameters from the provider return URL cannot change that state, and the
status read does not call `createPayment`.

## Schema and ownership notes

Migration 011 extends the T-36 order schema with the provider transaction ID,
the last normalized gateway result, and `needs_review`. It refuses to run when
the required order, seat, allocation, or hold tables/columns are missing; it
does not edit migrations 009 or 010. Rollback refuses to discard recorded
payment results.

Migration 007 defines `seats` per showtime, and migration 009 keeps the actual
seat IDs in `order_items`. There is no mutable sold flag on `seats`; a paid order
with unreleased items is the sold allocation. The public seat map now reads this
allocation as sold. `seat_holds` is quantity-based and has no seat IDs, so T-37
must create its order items from the selected seat IDs and atomically link the
pending-payment hold to that order. T-42 checks the linked hold owner, showtime,
quantity, expiry, and every unreleased seat allocation; it cannot infer a seat
list from the hold itself.

No notification or accounting module is present in this checkout. A
`needs_review` outcome is available to S-20 for post-commit follow-up; T-42 does
not create a second notification subsystem.

## Verification boundary

The PostgreSQL integration test uses a unique schema inside an explicitly named
disposable test database (`DB_NAME_TEST`). It applies migrations 006, 007, 009,
010, and 011 there; it never targets a development or production database.
T-37 order creation/expiry and S-20 webhook route/replay integration remain
acceptance dependencies because those implementations are not present in this
checkout.

Run the PostgreSQL tests from PowerShell only after creating a disposable test
database and configuring its host/user/password:

```powershell
$env:DB_NAME_TEST = 'eventticketing_t42_test'
$env:RUN_PAYMENT_RESULT_DB_TESTS = '1'
npx jest tests/paymentResult.integration.test.js --runInBand --coverage=false
```

The integration test overrides the configured database name with
`DB_NAME_TEST`; it does not use `DB_NAME`.
