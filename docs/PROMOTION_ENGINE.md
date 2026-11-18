# Phase 11D promotion API

Shared Node/D1 implementation; additive Node migration 9 / D1 0013. Integer-MNT preview only: no orders, checkout, payments, sales inference or marketing recommendations. Original menu prices never change. No frontend files changed.

Owner base `/api/v1/owner/cafes/{cafe}/promotions`. Existing session, owner/admin role AND current cafe ownership required. Transaction-time actor role/version/session expiry/revocation/ownership checked inside atomic writes. JSON max16 KiB; 120 requests/IP/minute per runtime. Public cafe must be active. All responses no-store; live SQL projections avoid stale schedule or hidden-product cache exposure. Menu cache contains no promotion state and needs no eviction.

| Method | URL | Request / response |
|---|---|---|
| GET | owner base | limit1–100 default50, offset0–10000 default0, state=active/upcoming/expired/draft; `{items:[promotion],pagination:{limit,offset,has_more}}` |
| GET | owner base/{id} | `{promotion}` |
| POST | owner base | create fields; 201 `{promotion}` |
| PATCH | owner base/{id} | current version plus changed fields; `{promotion}`; published:false pauses |
| DELETE | owner base/{id} | JSON `{version}`; `{archived:true}`; stable IDs/associations retained |
| POST | owner base/preview | `{product_id,variant_id?,at?,promotion_id?}`; preview below |
| GET | `/api/v1/cafes/{cafe}/promotions` | public active rules only; limit/offset; same list envelope |

Create example:

```json
{"title":"Example configured rule","type":"product_discount","discount_kind":"percentage","discount_value":10,"starts_at":"2026-11-18T00:00:00Z","ends_at":"2026-11-19T00:00:00Z","product_ids":["ACTUAL_PRODUCT_ID"],"published":false}
```

Fields: title required nonempty max120; description/terms optional max2000; type required: percentage, fixed_amount, product_discount, category_discount, happy_hour, student_discount, combo_announcement. Percentage/fixed types determine discount_kind. Product/category/happy_hour require discount_kind percentage or fixed_amount. Discount value required integer: percentage1–100, fixed1–1e9 MNT. Informational student/combo types require null/absent discount_kind/value and never alter prices. Product/category rules require a corresponding nonempty association set. product_ids/category_ids each <=20 distinct owned IDs; foreign/missing references rejected and composite FKs reinforce tenancy. Both sets mean intersection. Empty sets mean cafe-wide. Unknown fields rejected. Optional published/featured are booleans, default false. starts_at/ends_at required timezone-bearing ISO timestamps, stored canonical UTC; end strictly follows start. Strings use plain text, never HTML.

Optional schedule: `{days:[0,1,2,3,4,5,6],start:"HH:mm",end:"HH:mm"}`; Sunday=0, weekdays unique/nonempty, clock times 00:00–23:59, start != end. Evaluation uses Intl Asia/Ulaanbaatar, not server local timezone. Absolute UTC envelope and recurring window must both match. Start inclusive/end exclusive. Overnight end belongs to next local day; after-midnight eligibility checks previous weekday. Outside a recurring window inside its absolute envelope, state is upcoming. Unpublished/paused/archived is draft; past published envelope expired.

Promotion response fields: id,cafe_id,title,description,type,discount_kind,discount_value,starts_at,ends_at,schedule object/null,terms,published/featured/archived as0/1,version,created_at,updated_at,product_ids,category_ids; list additionally state. Public associations are rejoined against currently published categories and nonarchived published products. A scoped rule with no visible associations is omitted, never widened to a global rule. Owner rows retain private associations. Lists are deterministic starts_at,id; schedules are filtered before pagination. Three bounded projection queries, no N+1 queries.

Preview derives current listed price from persisted item/active variant (discounted_price if set, otherwise base/variant price). Clients cannot supply price. Eligible rules do not stack: choose lowest resulting price; equal results choose lexicographically smallest stable promotion ID. Percentage reduction is floor(listed_price × percentage /100), then subtract; fixed reduction clamps final price to0. No negative or fractional MNT. A promotion_id preview treats that owned draft/paused rule as published, but still applies its schedule/envelope/associations. Informational rules never discount. Without promotion_id only published rules participate. Response `{product_id,variant_id:null|string,at:UTC,currency:"MNT",listed_price:integer,resulting_price:integer,applied_promotion_id:null|string,stacking:false}`. Preview is a technical rule calculation, not a purchase/availability/reservation guarantee.

Initial engineering admission bound: 100 retained promotions/cafe including archived records, enforced atomically. This reuses menu's conservative retention approach; it is not an approved permanent business quota. Owner must review capacity/retention before a larger rollout; no destructive pruning is implemented. IDs remain stable for future order associations. No remote resources created; R2/KV unnecessary.

Errors: 400 malformed JSON,401 auth,403 role/origin,404 tenant/entity,409 access_changed/version_conflict/promotion_limit,413 body,415 content type,422 validation_failed,429 rate_limited,503 storage unavailable/quota, sanitized500 unexpected storage errors. SQL/audit changes roll back together. Server actors/ownership never come from request JSON.

Six focused Node tests cover CRUD/publish/pause/archive, invalid prices/ranges/foreign tenants, deterministic overlaps/ties and clamping, informational rules, Ulaanbaatar boundary/overnight schedules, private-association suppression, malformed schedule/preview, authorization races and Node HTTP. Local D1 probe exercises creation, public list and authoritative preview with metadata measurements. Runtime/regression totals: overnight TEST_RESULTS.md. No production schedule, client policy or provider capacity verified.
