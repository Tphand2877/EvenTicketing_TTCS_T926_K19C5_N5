# T-52 — Minh Quang

Jira: SCRUM-200. Scope is the overdue-order cleanup job only.

The backend runs cleanup immediately at startup and then every minute. It scans
pending overdue orders in batches of 100 until the backlog is empty, with no age
cutoff. `ORDER_EXPIRY_CLEANUP_INTERVAL_MS` defaults to 60000; invalid values use
that default. Shutdown waits for the active pass before closing the database.

For each candidate, T-52 calls the team's T-42
`paymentResultRepository.withLockedOrder`. Both webhook and expiry therefore
lock order, allocations/seats and hold in the same order. Inside that transaction,
the job rechecks `status = pending` and the database deadline, updates the order
to `expired`, releases unreleased `order_items` and deletes its linked
`pending_payment` hold. If any write fails, the transaction rolls back. Paid,
review, cancelled, expired and not-yet-overdue orders are not released.

The partial index on `(expires_at, id) WHERE status = 'pending'` supports scanning.
Repeated/concurrent workers cannot expire a paid order or release the same order
twice. Each order has its own transaction; a later retry handles any remaining
backlog after failure. Success logs only `[OrderExpiryCleanup] expired=N` and
failure logs fixed text, without identifiers, SQL errors or payment data.

T-36/T-42's schema and row-lock repository remain in the team's S-18 branch.
This PR does not recreate them, create tickets/payments/gateways or implement a
refund processor. T-46 forwards late callbacks to T-42 for review handling.

Unit checks cover scheduler timing/retry/shutdown, batch draining, sharing the
T-42 transaction and conditional expiry guards. Run backend `npm run lint`,
`npm run build`, `npm test -- --runInBand`.

T-53's three-order integration scenario and the full webhook/cleanup race suite
are outside this PR and must be completed by that task's owner. No completion
claim is made for T-53 or the whole S-23. Team review and staging acceptance are
still required before Done.
