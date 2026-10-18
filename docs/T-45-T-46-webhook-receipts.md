# T-45 / T-46 — Minh Quang

Jira: SCRUM-206, SCRUM-207. This PR contains these two subtasks only.

## T-45 receipt storage

`payment_events.transaction_id` is unique. The table stores the opaque order
reference, exact raw JSON text, receipt/processing timestamps and outcome for
reconciliation. It does not define orders, payments, tickets or a gateway.
Known nested card/PAN/CVV fields are rejected before persistence. The provider
adapter must also guarantee card-free raw values/metadata; the payload is kept
unchanged rather than redacted after receipt.

## T-46 webhook boundary

The route `/api/payments/webhook` passes `req.rawBody` from the team's T-42 JSON
parser to `paymentResultService.verifyWebhook`. Signature implementation and
gateway configuration remain owned by T-40/T-42/S-21.

After verification, one PostgreSQL transaction inserts the receipt using
`ON CONFLICT (transaction_id) DO NOTHING`. A duplicate waits for the winner,
skips T-42 and returns the same HTTP 200 ACK. The winner passes the **original
verification token**, without cloning/serialization, to
`applyVerifiedResult(verifiedResult, { transaction })`. All payment, order and
seat changes remain in T-42 and use the supplied transaction. Exceptions roll
back the receipt with those writes, so the gateway may retry.

The deduplication key is the gateway transaction ID, falling back to T-42's
stable provider event ID when no transaction ID exists. T-42 outcomes
`needs_review`/`anomaly` are recorded for reconciliation; `LATE_PAYMENT_SUCCESS`
gets `refund_review` on the receipt. T-46 does not independently change the
order or create a refund workflow. Responses/logs do not include raw payload,
order references or payment details. JSON input is limited to 64 KiB.

## Dependency and verification

The PR is based on `feature/s-18-payment-gateway`, where the team supplies
`verifyWebhook` and `applyVerifiedResult`. That branch's code is a dependency,
not part of Minh Quang's change. Merge the dependency first and retarget this
PR to main; its diff contains only T-45/T-46 and their validation/documentation.

Run backend `npm run lint`, `npm run build`, `npm test -- --runInBand`.
The database checks require an explicitly disposable `DB_NAME_TEST` and
`RUN_PAYMENT_EVENT_DB_TESTS=1`. They exercise unique insertion, exact raw text,
duplicate serialization, a single T-42 callback and rollback/retry on real
PostgreSQL. They do not supply a payment gateway or order/ticket fixtures.

T-47's replay/ticket-count script and full acceptance integration remain with
that task's owner. This PR makes no completion claim for T-47 or the whole S-20.
