# Minh Quang — T-17 (SCRUM-163), T-19 (SCRUM-166)

T-27 (SCRUM-177) is tracked separately in PR #22. This change contains read APIs,
query code, Redis caching and tests only. No frontend, seat import, sales-state
transition, hold creation or ticket/payment feature is implemented here.

## Public API

All three endpoints work without authentication. Fields are explicitly selected;
organizer IDs, notes, hold owners, order IDs and payment data are never returned.

* `GET /api/showtimes?limit=20&cursor=...` returns
  `{success:true,data:{showtimes:[],pagination:{limit,has_more,next_cursor}}}`.
  Each item contains `id,event_id,title,description,category,venue,image_url,
  starts_at,ends_at,status,min_price,max_price`.
  Only future `on_sale` showtimes of published events are listed. Prices are
  MIN/MAX of their seat categories, not the legacy single `showtimes.price`.
  Categories without prices return null; this task does not set pricing rules.
* Sort is `(starts_at ASC, id ASC)`. Send `next_cursor` unchanged for the next page.
  PostgreSQL microsecond precision is preserved in the cursor. Limit is 1–50,
  default 20. Invalid cursors/limits return 400. Cursor pagination avoids skips
  and repeats for unchanged sort keys; live edits to performance dates are not
  a frozen snapshot across pages.
* `GET /api/showtimes/:id` returns `{showtime,on_sale}`. Draft/closed/past
  showtimes of a published event return `on_sale:false` and the message
  `Suất diễn không mở bán.`; callers must hide seat selection. Missing IDs and
  private events return 404. This detail endpoint is not cached.
* `GET /api/showtimes/:id/seats` returns `{showtime_id,seats:[]}`.
  Each seat contains `id,row,number,category_id,category,price,status`.
  Exactly three statuses: `available`, `held`, `sold`. Sold takes priority.
  Active holds count only while `expires_at > statement_timestamp()`; pending
  payment remains held and confirmed allocation remains sold after hold expiry.
  Cancelled holds and refunded/cancelled tickets are excluded. One SQL statement
  returns the entire map and checks sale visibility in the same DB snapshot.
  No per-seat SQL calls, no seat-state cache. Closed/draft/past showtimes return
  409 with no map. Missing/private showtimes return 404.

The existing `/api/events` and quantity-based `/availability` APIs remain as
the previous sprint's contract. FE2/FE3 can integrate these new endpoints without
changes to their code in this backend PR. These queries do not allocate seats;
the hold-writing API must still validate availability atomically.

## Integration dependencies (not yet present on main)

T-11 / Phi Hùng owns seat/category migrations; T-15 owns the showtime sale enum
and transition rules. The query adapter currently expects the following names.
If their implementation differs, update `backend/src/models/PublicShowtime.js`
or expose equivalent read views; do not create a second competing write model.

| Source | Required fields |
| --- | --- |
| `showtimes` | existing fields plus enum `status`: `draft`, `on_sale`, `closed` |
| `seat_categories` | `id,showtime_id,name`; optional numeric `price` from S-15 (missing/null means unknown price) |
| `seats` | `id,showtime_id,row_label,seat_number,category_id` |
| `public_seat_holds` read view | `showtime_id,seat_id,status,expires_at`; active / pending_payment / confirmed / cancelled |
| `public_sold_seats` read view | `showtime_id,seat_id`; only currently sold tickets |

T-19 explicitly permits simulated hold/ticket sources and ready join points.
The two read views are those join points. Their owners connect the actual
per-seat records when T-22/ticket features land. The quantity-only hold table in
PR #22 has no seat IDs and cannot reliably supply this map: do not invent seat
IDs or distribute held quantities across arbitrary seats.

This PR deliberately does **not** install empty production views: they would
incorrectly mark held/sold seats available. Missing tables/columns/views return
503 (`Dữ liệu suất diễn chưa sẵn sàng.`), with no raw SQL data. Consequently these
new endpoints cannot pass integrated staging ACs until dependencies are connected.
Fixture tables/views exist only in an isolated test schema that is dropped at the
end of the test suite. They are not migrations or a production sales/booking flow.

Schema owners should retain indexes on category/seat `showtime_id`, allocations
`(showtime_id,seat_id)`, and catalog `(status,starts_at,id)`; ensure allocation seat
IDs belong to the same showtime via constraints. Ticket views must exclude voided
and refunded records. Pending-payment allocations must also feed the hold view.

## Redis and validation

Set `REDIS_URL=redis://localhost:6379` locally; Compose configures the private
Redis service with no published port. Use an authenticated `rediss://` URL for
an external server. The URL is never logged. Cache keys hash the normalized page
limit and cursor. Redis SET uses EX 30; different pages use different keys.
Missing/offline Redis falls back to PostgreSQL. Connect/commands time out after
100ms, offline queue/reconnection are disabled, retry cooldown is 5 seconds.
Redis is required to meet the cache NFR. Cached lists can lag sales changes by
up to 30 seconds; uncached details/maps enforce current sale state.

Run the normal backend build/lint/test commands. For real PostgreSQL/Redis tests:

```sh
RUN_PUBLIC_QUERY_DB_TESTS=1 RUN_PUBLIC_QUERY_REDIS_TESTS=1 \
REDIS_URL=redis://localhost:6379 npm test -- --runInBand
```

CI supplies PostgreSQL 16 and Redis 7, runs the actual SQL with simulated upstream
tables/views, checks cursor ties and microseconds, expired/live/payment/sold
states, duplicates, cross-showtime isolation, missing dependencies, 30-second TTL
and Redis cache hits. The suite records p95 from 40 HTTP/JSON samples: 200
showtimes <500ms and a 2,000-seat map <200ms. CI measurements are fixture-based,
not evidence of staging production performance. Human review and integrated
staging acceptance remain required before marking Jira Done.
