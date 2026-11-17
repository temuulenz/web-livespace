# Phase 11 frontend integration guide

Updated by the deployment readiness review, 2026-11-17. Backend APIs A–H exist locally; production remains NO-GO pending [deployment gates](PHASE11_DEPLOYMENT_REVIEW.md). No teammate frontend component, adapter, stylesheet or fixture was modified by this review.

## Current compatibility boundary

The existing platform session/live-sensor service uses real APIs when available. **js/services/customer-adapter.js still exports a mock adapter** using localStorage. Its demonstration phone OTP, going/visit and menu flows do not become authenticated server features merely because Phase 11 exists. There is no server phone-OTP, verified-visit, order, payment, revenue, researcher or unrestricted raw analytics API. Keep unsupported flows clearly demo-labelled until a separately authorized integration supplies documented behavior. Do not map an email/password session to an invented phone credential.

Use the native framework and createApiClient conventions; no frontend dependency/build step is needed. Feature contracts are authoritative for exact fields: [menu](MENU_MANAGEMENT.md), [inventory](INVENTORY_MANAGEMENT.md), [reviews](RATINGS_AND_REVIEWS.md), [promotions](PROMOTIONS.md), [analytics](BEHAVIOR_ANALYTICS.md), [notifications](NOTIFICATIONS.md), [resources](RESOURCE_CONTROLS.md). Machine handoff: [OpenAPI](openapi.yaml), [Postman](PHASE11.postman_collection.json), [API index](PHASE11_API_CONTRACT.md), [permission matrix](PHASE11_PERMISSION_MATRIX.md). There are 71 operations across 54 paths; the collection has 72 requests including login. Counts are not a substitute for payload/role validation.

## Shared HTTP and security behavior

Base `/api/v1`. Authenticate using existing `/auth/login` JSON email/password and same-origin cookies. Use credentials on requests; never put session/device tokens in URLs or localStorage. Current ownership/role/recipient is checked server-side; a cafe ID in browser state grants no authority. Keep login/logout/session-expiry behavior from the existing framework.

Private requests use no-store. Writes send Content-Type: application/json with exact whitelisted body fields and current version where required. Prices/quantities are integers; flags in stored menu/inventory entities often return 0/1 while input requires JSON booleans. Timestamps persist UTC. Report date inputs and promotion recurrence use Asia/Ulaanbaatar, not browser-local timezone guesses. Never assume a null/omitted metric means zero.

| Result | Client action |
|---|---|
| 400/415/422 | Surface validated field/request failure; fix input, do not retry unchanged indefinitely |
| 401 | Use existing session-expiry/sign-in path |
| 403/404 | Treat as denied/absent; clear scoped private state after ownership/session changes; do not probe other tenants |
| 409 version_conflict | Refetch authority/current entity and let user resolve. In-flight authority changes can also produce this existing code after the review fix |
| 409 idempotency_conflict | Stop retrying a changed stock request under the old key |
| 429 | Back off with bounded jitter/retry; respect budget limits and Retry-After when present |
| 503 | Show unavailable/deferred state and retry conservatively; do not substitute demo numbers into live data |
| Network timeout | Mutation may have committed. Use each feature's recovery mechanism below before issuing a new logical mutation |

Render all user/stored names, comments, descriptions, reply text and notification labels as text. Do not interpolate them as HTML. Public projections do not contain private owner/reporter/account/diagnostic data; do not merge owner-only fields into public caches. Abort stale requests and clear tenant-scoped caches when switching cafe/user.

## Menu, CSV, media and promotion prices

Owner base `/owner/cafes/{cafe}/menu`. Fetch categories/products/variants independently with limit/offset; responses are `{items,pagination}`. Create returns `{item}`. PATCH needs the positive current version; bulk accepts 1–10 distinct versioned edits. Categories/products start as drafts; publish both for public visibility. DELETE product archives, variant deactivates; stable IDs remain. Category deletion can conflict while any product/promotion references it. A–D owner operations require actual cafe ownership even for an admin; analytics/resources have separate administrator oversight rules.

Public GET `/cafes/{cafe}/menu` returns `{cafe_id,menu_url,categories,products,pagination}`. Product details use product_id query; category_id/featured/q are supported. Missing/empty variants is valid. Load menu on the relevant cafe view, not all cafes on the homepage. Raw snapshots cache for five seconds server-side, with targeted mutation invalidation; no menu realtime event exists. Refresh affected lists after successful owner changes.

Use additive `effective_price` and `promotion_id` for the displayed catalog price. Do not overwrite base_price/discounted_price. Server evaluates schedule/recurrence after the raw snapshot cache: integer MNT, no stacked promotions, lowest price, deterministic tie, equal/better manual discount wins. A visible page still needs a refetch to show a future schedule transition; server-side evaluation does not push a timer update into the DOM. There is no checkout guarantee. Public `/cafes/{cafe}/promotions` and owner `/owner/cafes/{cafe}/promotions` are separate APIs; preview is a no-write owner operation. Follow PROMOTIONS.md for targets, UTC schedule and local overnight recurrence.

CSV import is a preview then explicit confirmation: resend identical csv, preview_id and confirm:true to `/import/confirm`. Exact header is `category_id,name,description,base_price,discounted_price`; <=12,000 bytes/20 rows (operator may lower), drafts only. Preview creates nothing. Ambiguous confirm retry must retain identical CSV/preview; do not append a new row or generate a new import to recover. Archived records still count toward quotas.

PUT `/owner/cafes/{cafe}/menu/products/{product}/image` takes `{version,image}` with a canonical JPEG/PNG/WebP data URL <=1 MiB (lower configurable). Upload JSON cap is 1,450,000 bytes. No SVG/remote image URL/path input. Fetch through public or authorized owner product-image route, never object_key/file paths. Replacement/detachment changes product version. ETag requests still require current permission/publication. Treat validators as opaque: the corrected Cloudflare D1 fallback versions its validator to refresh formerly empty cached bodies. media_pending indicates staged storage requiring operator reconciliation; do not auto-delete/retry aggressively or show private storage diagnostics.

## Inventory and realtime

Read separately paginated `/cafes/{cafe}/inventory`; merge by product_id plus nullable variant_id into currently visible menu entries. Missing stock is unconfigured/hidden, not sold out or quantity zero. Omitted public quantity must remove a previously displayed quantity; never retain a stale private/exact value. Check revision across pages and restart collection if it changes.

Owner `/owner/cafes/{cafe}/inventory/mutations` uses one stable idempotency_key and 1–5 updates with current version, reason and quantity/availability fields. First configuration version is 0. Retry the exact same body/key after ambiguous failure; after real conflict fetch latest state before starting a new intentional mutation/key. Never generate a fresh key for a network retry. Movement history is separate/private.

Node supports cafe-scoped inventory SSE `/cafes/{cafe}/inventory/stream`. Cloudflare uses the existing browser rooms; honor `/config` and polling fallback rather than opening unsupported Node SSE URLs. Apply inventory.changed only for increasing per-target versions; removed:true removes that target. A revision gap, reconnect, missed delta or snapshot_changed requires fetching snapshot_url. Cloudflare live.snapshot carries recovery revision/URL. Sensor transport is separate; sensor events/people counts never imply stock availability or measured seat positions. Private inbox data never uses public realtime.

## Reviews and moderation

Public `/cafes/{cafe}/reviews` and `/ratings` are independent paginated-list/summary reads. Create a review with all five integer keys taste,service,comfort,value,study (1–5), optional plain comment. Recover ambiguous create via GET `/me/cafes/{cafe}/review`; repeated creation may return review_exists. Own edit/delete require current review version. Hidden review edits remain hidden. Public names/ratings are unverified feedback, not verified purchases/visits.

Owner may list/reply/report, not hide negative reviews. Reply version 0 creates; current reply version edits/deletes. Only admins use moderation routes with a reason. On moderation/author change refresh summary/list as needed; no review realtime stream is promised. No reviews returns null means, not zero stars; actual summaries include all 30 distribution bins. Do not expose author_id/moderation/report fields from private responses publicly.

## Analytics and aggregate reporting

Collection is disabled in checked-in production config. Handle disabled 404 as expected; do not retry continuously or claim analytics are being collected. For an approved enabled deployment, POST `/analytics/session` with `{}` first to initialize the HttpOnly ls_analytics cookie. Preserve random event IDs/body through bounded retries inside the default two-day dedup window. Never reuse IDs for different content or silently replay expired browser queues.

POST `/analytics/events` with schemaVersion:2, cafeId and 1–32 events, <=16 KiB. Allowed types: cafe_view, cafe_search, filter_apply, menu_view, product_view, favorite_add, favorite_remove, promotion_view, promotion_click, directions_click, review_submit, out_of_stock_view. Event keys only id,type,productId,promotionId,filter. Product/promotion events require corresponding valid references; filter_apply only accepts noise,wifi,availability,goal,district. No search text, location, client timestamp, account ID, fingerprint or arbitrary metadata. Domain actions are not automatically tracked by the backend; add events only after the relevant UI/domain result, avoid render-loop duplicates, and label all browser counts unverified. Server stamps time. Authenticated users use the same pseudonymous analytics-session mechanism; there is no individual owner-visible history.

Owner `/owner/cafes/{cafe}/analytics[.csv]`, admin cafe equivalent or `/admin/analytics[.csv]`. Query since/until are YYYY-MM-DD local dates, until exclusive; granularity day/week/month, compare true/false, source real/simulated, bounded limit/offset. Defaults seven local days/31-day maximum and <=100/page, operator configurable. Cloudflare legacy hourly/ISO requests use its v1 interface; new cross-runtime clients should use the documented date-only v2 report contract.

Reports can lag collector flush plus 30-second cache. Suppressed small cohorts are omitted including keys; honor suppressed_cohorts/behavior_status/unique_sessions_status. Never reconstruct “hidden” cells or turn null into zero. Popularity is returned-page-only; CTR is null when required cells are suppressed/incomplete. Current favorites/inventory/connectivity are snapshots, visible reviews are a defined period cohort, historical stock/connection duration and revenue/sales are unavailable. Sensor source/coverage status distinguishes real/simulated/stale/invalid/insufficient; uncalibrated dBFS is separate from SPL. Platform unique people is unavailable because cafe pseudonyms cannot be linked.

CSV is the safe behavior page for current/previous periods, not a complete workbook of every metric. Paginate explicitly with the same filters if collecting more pages; respect privacy flags and page bounds. A 200 response is not evidence that browser events are verified physical traffic.

## Notifications and resource views

Poll GET `/me/notifications?limit=...&offset=...` for `{items,pagination,unread}` using a bounded, visibility-aware timer and backoff. Share polling state within the app; default private insight routes share 60 requests/IP/minute, so avoid per-component one-second polling. No private notification SSE/email/push channel is configured. Enqueue and delivery are asynchronous; a successful domain mutation does not imply an immediate inbox item.

Items contain id,cafe_id,category,entity_id,severity,created_at,read_at. Display strings are frontend-owned; resolve links only through authorized documented entity routes. POST `/{id}/read` or `/read-all`; a foreign notification is 404. GET/PATCH `/me/notification-preferences` is a partial category→boolean map; marketing promotion defaults off and delivery also requires current cafe favorite. Do not opt users in automatically or send recipient IDs.

Categories: review_submitted,review_reply,inventory,promotion,promotion_expiry,sensor_offline,sensor_recovered,resource,moderation. Resource severities warning/critical/hard_limit; operations and marketing stay distinct. Read state/preferences persist. Cooldowns/budgets can suppress/defer events; a quiet inbox is not a health-monitor guarantee.

Owner `/owner/cafes/{cafe}/resources`, admin cafe equivalent and `/admin/resources/monitor` return scoped usage. Owners cannot change controls. Only admins PATCH `/admin/resource-controls` or cafe equivalent with analytics_paused:boolean; it pauses optional intake, not essential sensors/security or every job. `/admin/maintenance` POST performs one bounded step, never “drain all.”

Metrics are application measurements, some reset on runtime restart. Provider billing/unsupported attribution is explicitly unavailable; do not show a null as zero cost or claim global socket counts. Resource analytics “today” now uses Asia/Ulaanbaatar to match admission; sensor daily counts retain an explicit UTC label. Flushed totals remain lagged and are not remaining intake capacity (R13 resolved locally by the readiness checkpoint). Use role/tenant boundaries rather than assuming every admin endpoint has the same Super Admin policy.

## Integration validation before launch

Verify guest/customer/owner A/owner B/admin/disabled sessions, tenant switches, revocation, cross-origin rejection, in-flight authority conflict, stale versions and ambiguous retries. Exercise Node SSE and Cloudflare room/polling recovery separately. Verify text rendering, missing quantity/null/suppressed states, CSV preview/confirmation, marketing consent, private media 304 authorization and disabled analytics. Confirm no mock identity/state leaks into HTTP mode and no live page silently substitutes simulated business/sensor values.

Run native Node, sensor, browser, E2E and local Cloudflare suites with disposable profiles/databases; then perform the [staging smoke procedure](PHASE11_DEPLOYMENT_CHECKLIST.md) against the actual integrated frontend. Current browser tests establish preserved legacy UI/fallback, not end-to-end completion of a still-mock customer adapter. The isolated `node scripts/phase11-menu-demo.mjs` exercises simulated menu/stock/review APIs and cleans up; it does not supply a persistent server/login or production data.
