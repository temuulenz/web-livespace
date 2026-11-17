# Phase 11D promotion backend

Shared service: `shared/business/promotions-service.mjs`; pure validator/pricing: `promotions.mjs`. Additive Node migration 9 / D1 0013. Both runtime adapters use the existing cookie sessions, same-origin policy, 16 KiB JSON bodies and 120 requests/IP/minute. Owner/admin role AND current actual cafe ownership are required. Write-time SQL rechecks current enabled owner identity. Foreign references are rejected by validation and composite foreign keys. At most 100 retained promotions/cafe, enforced inside the insert transaction. Writes and immutable business audits are atomic. PATCH requires the current version; competing edits return 409. There is no hard deletion: unpublish preserves stable analytics references.

## HTTP contract

Owner base `/api/v1/owner/cafes/{cafe}/promotions`:

- GET: `limit=1..100`, `offset=0..10000`; `{items:[],pagination:{limit,offset,has_more}}`.
- POST: create; 201 `{promotion:{...}}`.
- PATCH `/{promotion}`: partial fields plus integer `version`; 200 `{promotion:{...}}`.
- POST `/preview`: `{promotion:{full create fields},product_id,at?:UTC}`; `{at,price:{base_price,effective_price,promotion_id}}`; no write; evaluates the rule as published while respecting its schedule.

Public GET `/api/v1/cafes/{cafe}/promotions`: active cafes only; `{cafe_id,at,promotions:[]}`. Includes only published rules active at server time; omits tenant owner/audit identities. No public future-time query. No shared/KV cache.

Create fields: `name` (1–120), `kind` (`fixed` or `percentage`), integer `value` (fixed 1–1e9 MNT, percentage 1–100), `starts_at`, `ends_at` (UTC ISO timestamps, end after start), optional `published` (boolean, default false), `product_id` OR `category_id` (null defaults mean cafe-wide), optional `recurrence:{days:[1..7],start_minute:0..1439,end_minute:0..1439}`. Unknown fields rejected. Recurrence uses Asia/Ulaanbaatar, ISO weekday Monday=1. Equal start/end rejected; overnight ranges belong to the starting day. UTC schedule and local recurrence both must match. Schedule endpoints are start-inclusive/end-exclusive.

Examples:

```json
{"name":"Morning coffee","kind":"percentage","value":15,"category_id":"CATEGORY_ID","starts_at":"2026-11-01T00:00:00Z","ends_at":"2026-12-01T00:00:00Z","published":true,"recurrence":{"days":[1,2,3,4,5],"start_minute":540,"end_minute":660}}
```

Errors use existing envelopes: 401 missing session, 403 role/origin, 404 foreign/missing cafe or promotion, 409 version_conflict/promotion_limit, 413 oversized body, 415 content type, 422 invalid fields/tenant target, 429 rate limit. Storage failures never report success.

## Menu integration and pricing

Public menu products and variants gain additive `effective_price` and `promotion_id` fields. Stored base/manual discounted prices remain unchanged. Each eligible promotion is evaluated against base price independently; lowest final price wins without stacking. Percentage price rounds down to whole MNT; fixed discounts clamp to zero. An existing equal/better manual discount wins. Equal promotion prices use stable promotion ID order. Variants use their own price and inherit product/category targeting. This is a catalog price, not a checkout guarantee.

Promotion reads/pricing occur after the existing raw menu snapshot cache on every request. Consequently edits, unpublishing and scheduled start/end transitions do not await cached snapshot expiry; no unrelated profile cache is invalidated. This adds one bounded indexed promotion read per menu request. It must be included in new D1 budget measurements. There is no frontend wiring, payment or checkout implementation.

## Validation and remaining release gates

`node --test tests/promotions.test.mjs` covers strict input, calendar/schedule boundaries, local daytime/overnight recurrence, rounding/ties/nonstacking, targeting, current ownership, transaction quotas, concurrent versions, audit rollback, cache-time transitions, HTTP session/origin/body limits. Local D1 integration passed (28 Cloudflare checks); D1 races/rollback and actual metadata are recorded in PHASE11_PROMOTION_D1_MEASUREMENTS.json. Nine focused promotion tests pass. Release-wide mixed workload measurements remain outstanding for the whole phase. See PHASE11_PROGRESS.md for current validation, later-subphase gaps and exact continuation.
