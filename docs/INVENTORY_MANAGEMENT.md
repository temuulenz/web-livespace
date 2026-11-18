# Phase 11B inventory backend

Implemented for Node SQLite and Cloudflare D1 with additive Node 7 / D1 0011. Authoritative stock, immutable movements, request receipts and cafe revisions live in the database. No orders or reservations. Existing menu IDs, sessions, cafe assignments, Node SSE and Cloudflare browser rooms are reused. KV and caches never own stock.

## HTTP contract

Owner base: `/api/v1/owner/cafes/{cafe}/inventory`. Existing session and owner/admin role AND actual cafe ownership required. Other cafes return 404; guest 401; wrong role/origin 403. JSON maximum 16 KiB. All inventory routes share a per-process/isolate IP cap of 120/minute; not a distributed admission guarantee. JSON responses are no-store.

| Method | Path | Request/query | Response |
|---|---|---|---|
| GET | owner base | product_id, low_stock=true/false, sold_out=true/false, limit, offset | `{items:[inventory],pagination}` |
| POST | owner base + /mutations | mutation below | `{items:[inventory],duplicate:false}`; retries duplicate:true |
| GET | owner base + /movements | product_id, variant_id, limit, offset | `{items:[movement],pagination}` |
| GET | `/api/v1/cafes/{cafe}/inventory` | product_id, limit, offset | public snapshot below |
| GET | `/api/v1/cafes/{cafe}/inventory/stream` | Node only; no body | SSE inventory.snapshot then inventory.changed |

Pagination: limit integer 1–100 default 50, offset integer 0–10000 default 0. Inventory sorts product_id,id; movements at descending,id. Equal movement timestamps use stable ID as tie-breaker. `has_more` is determined by one extra row. No unbounded history endpoint.

Mutation example:

```json
{"idempotency_key":"stock-update-uuid","updates":[{"product_id":"ACTUAL_PRODUCT_ID","variant_id":null,"version":0,"mode":"quantity","quantity":12,"low_stock_threshold":2,"show_quantity":false,"reason":"restock"}]}
```

1–5 distinct targets per transaction. idempotency_key is 1–80 ASCII letters/digits/underscore/period/colon/hyphen. Update fields whitelist: product_id, optional variant_id (null for product stock), version, mode, quantity, delta, status, low_stock_threshold, show_quantity, enabled, reason. Required product_id, version, reason. Current version is required; use 0 to configure a target for the first time. Mode is availability or quantity (new default availability). Status is available, sold_out or temporarily_unavailable (default available). Reasons: restock, manual_adjustment, correction, waste. Flags must be booleans. Quantities/thresholds are integers 0–1,000,000,000; signed delta is within ±1,000,000,000 and requires existing quantity-mode stock. Exact quantity and delta are mutually exclusive. Availability mode forbids quantity/delta. Quantity zero always becomes sold_out; a positive quantity becomes available unless temporarily_unavailable. A null quantity never means zero.

Inventory response rows contain id,cafe_id,product_id,variant_id,mode,quantity,status,low_stock_threshold,show_quantity,enabled,version,updated_at. Stored flags return 0/1. Disable a source using enabled:false before enabling a competing source in the same ordered bulk transaction. Only one enabled product-level source OR enabled variant-level sources may exist per product. Disabled rows retain their stable IDs, quantities and history; no physical inventory delete API exists. Variant/product relationships and cafe ownership are checked server-side and reinforced by composite foreign keys/triggers. Source identity cannot be changed in place.

Each accepted change, including availability/configuration, appends one movement with stable ID,cafe_id,inventory_id,product_id,variant_id,previous_quantity,new_quantity,change_amount,reason,actor_id,at,version. Quantity transition from/to unconfigured/availability mode uses null change_amount; it is not a numeric restock. Actor comes from current session. All timestamps UTC. Audit, stock/version/revision, movements and receipt commit atomically. Movement rows cannot be modified/deleted. Failed second items or injected movement failures roll back earlier writes and receipt. No successful response for failed persistence.

Receipts bind cafe, key, authoritative actor and canonical request hash. An identical retry returns the original result without another movement or event; conflicting use returns 409 idempotency_conflict. Receipts have no automatic expiry, preserving retry safety across reconnects/restarts; capacity/archival must retain deduplication identities. Concurrent versioned changes have one winner and a 409 version_conflict loser. Query/save races are protected by SQL version predicates and a guarded audit insert in the same transaction. Retry network failures using the same body/key; after a genuine version conflict retrieve current stock before a new intentional mutation.

## Public projection and realtime

Only active cafes, published categories, published nonarchived products and active variants appear. Snapshot: `{cafe_id,revision,items:[{product_id,variant_id,status,low_stock,version,quantity?}],pagination,semantics}`. Exact quantity exists only for quantity mode with show_quantity enabled. No actor, movement, threshold, receipt or disabled/private state is public. A missing entry is unconfigured/hidden, never evidence of sold out. Read revision before/after the projection protects concurrent snapshots; after two changing reads return 409 snapshot_changed and retry. Check revisions across paginated pages; restart collection if they differ.

After COMMIT, build one bounded public projection for affected targets and publish a small cafe-scoped event:

```json
{"type":"inventory.changed","schemaVersion":1,"cafe_id":"CAFE","revision":3,"items":[{"product_id":"PRODUCT","variant_id":null,"status":"sold_out","low_stock":false,"version":2}],"snapshot_url":"/api/v1/cafes/CAFE/inventory"}
```

Disabled formerly public sources emit `{product_id,variant_id,version,removed:true}`. Current publication checks still apply. Clients compare per-target versions before applying deltas; events can be duplicated, coalesced or delivered out of order. A global revision gap means refresh the bounded inventory snapshot, not the full menu. Inventory has no HTTP/server value cache to invalidate; menu snapshots do not contain stock and stay independent. Cloudflare invalidates the room snapshot timestamp on delivery. Reconnect live.snapshot includes `inventory:{revision,snapshot_url}` from authoritative D1. The existing room session reauthorization applies to every private subscriber; public events never contain private quantity/history. Node dedicated SSE subscriptions are cafe-filtered and separate from existing sensor SSE; Node sensor broadcasts remain unchanged.

Delivery is best effort and never changes committed stock/ACK semantics. On lost notifications, reconnect or call snapshot_url. No client event handlers were modified. A subscriber must merge inventory only into currently visible menu entities. Owner edits may require both updated owner stock and public inventory projection, without a full menu reload.

Errors: 400 malformed JSON, 401/403 auth/origin, 404 tenant/entity/publication, 409 version_conflict/idempotency_conflict/inventory_source_conflict/inventory_conflict/snapshot_changed, 413 body, 415 content type, 422 validation_failed, 429 rate_limited, 503 storage quota/unavailable; sanitized 500 for unexpected failures. No raw SQL/storage diagnostics in response.

## Validation and resource measurements

Five new Node tests cover stock modes, zero/negative quantities, private quantity filtering, retries, source switching, tenant/role denial, concurrent decrements, post-write rollback, bulk atomicity, and post-commit Node SSE deltas. Local Cloudflare HTTP/hibernating-room checks cover D1 idempotency, hidden quantities, negative rejection and inventory snapshot recovery metadata. The local D1 probe also measures inventory create, duplicate, decrement and public snapshot, including index/trigger writes. See PHASE11_BUSINESS_D1_MEASUREMENTS.json and progress for exact final totals. Source selectors use inventory_product/inventory_variant; tenant/status/history queries use bounded indexed access. Bulk five keeps expected authorization, validation, persistence and delivery queries below D1 Free invocation limits. Browser fan-out adds room operations and session reads separately; those are not included in inventory D1 mutation figures. No production capacity guarantee or hardware validation is claimed.
