# T-44 payment provider configuration

The backend reads `DEPLOY_ENV` at startup. Set it explicitly in staging and
production. `NODE_ENV=production` may also be used on staging. If `DEPLOY_ENV`
is omitted while Node runs in production mode, startup fails closed.

| Deployment | `PAYMENT_PROVIDER` omitted | Allowed explicit provider |
| --- | --- | --- |
| development | MoMo | `momo`, `mock` |
| test | Mock | `momo`, `mock` |
| staging | Mock | `momo`, `mock` |
| production | startup error | `momo` only |

Remove `PAYMENT_GATEWAY`; it is rejected, including when it agrees with
`PAYMENT_PROVIDER`. Restart the backend to switch gateways. The selected
adapter is created before jobs and the HTTP listener, then shared by payment
initiation and payment-result processing.

For Mock set `MOCK_PAYMENT_WEBHOOK_SECRET` to a random value of at least 32
bytes, stored only in backend secret storage. Set `MOCK_PAYMENT_PUBLIC_ORIGIN`
to the public HTTPS backend origin on staging. Local development/test may use
`http://localhost:3000`. The checkout token is signed and expires after 15
minutes. The browser only submits the token and an outcome to the backend;
the server signs and verifies the result before T-42 applies it. Do not use
`VITE_MOCK_GATEWAY_SECRET` or any other browser signing key.

For MoMo set `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`,
`MOMO_REDIRECT_URL`, and `MOMO_IPN_URL`. Staging and production require HTTPS
callback and return URLs. The MoMo webhook endpoint is not yet mounted on this
S-18 based integration branch; the S-20 branch must be reconciled first.

## Rolling switch and dependency status

Orders retain `gateway_provider` and `gateway_request_id`. T-41 refuses to
create a new Mock transaction for an order already claimed by MoMo, or vice
versa. An old provider's callback cannot be verified by the newly selected
adapter. Operationally, stop new payment creation, wait for old callbacks,
reconcile indeterminate orders, then restart with the new provider. Automated
dual-provider callback verification remains integration work with S-20.

S-20 currently uses a separate payment processor referencing `payments`,
`tickets`, and `payment_reviews`, while S-18 T-42 settles `orders`,
`order_items`, and `seat_holds`. Do not merge that processor unchanged or
create a second settlement path. T-43's frontend page on `main` still signs
with `VITE_MOCK_GATEWAY_SECRET`; replace that call with the backend checkout
flow before merging branches. No secret should be present in browser assets.

## Verification

Run `npm run lint`, `npm run build`, and
`npx jest --runInBand --coverage=false` from `backend`. Enable PostgreSQL
integration tests only against a separately confirmed disposable database.
Production startup can be checked with `DEPLOY_ENV=production` and
`PAYMENT_PROVIDER=mock`: the process must exit nonzero before listening.
