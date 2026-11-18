# Phase 11 API contract — current checkpoint

Implemented locally: 11A menus, 11B inventory, 11C ratings/reviews, 11D promotions. 11E–11H are not implemented and have no advertised new endpoints.

- [Menu contract](MENU_MANAGEMENT.md): category/product/variant CRUD, stable public snapshot URL, versioned bulk publishing/reordering, explicit CSV confirmation, image operations, auth/validation/cache policies.
- [Inventory contract](INVENTORY_MANAGEMENT.md): availability/quantity sources, idempotent atomic mutations, private history, privacy-filtered public snapshots and cafe-scoped realtime/recovery.
- [Review contract](RATINGS_AND_REVIEWS.md): five criteria, author operations, owner replies/reporting, admin moderation/audit, incremental rating summaries/distributions and maintenance reconciliation.

Import [openapi.yaml](openapi.yaml) (JSON syntax, valid YAML 1.2): 53 operations including promotions/readiness. [Postman collection](PHASE11.postman_collection.json): 54 requests including existing cookie login, using local fixture placeholders. Full response field/role/error/realtime semantics are specified in the feature guides; no UI implementation is required. Node SSE inventory stream is explicitly transport-specific; Cloudflare uses the existing browser room.

All new mutations use existing session revocation, same-origin checks, authoritative cafe/author/role checks, prepared SQL, bounded JSON and per-runtime IP limiting. No client-controlled actor IDs, ownership or authoritative prices. No new analytics event collection or statistical dataset should be inferred from menu, inventory or review usage.

Overnight recovery addition: Phase 11D promotions are implemented; see PROMOTION_ENGINE.md for seven endpoints and authoritative unit-price/schedule semantics. GET /api/v1/ready is an additive DB/implemented-schema check, not release approval. Business mutations now recheck role, account version/disabled status, expiry/revoked session and applicable ownership inside the atomic transaction; 409 access_changed requires reload/re-authentication rather than a blind new mutation. Node JSON roots must be objects and same-origin includes effective scheme. No frontend changes required for existing valid requests. E–H remain unimplemented.

## Analytics intake and private reports

Both runtimes support disabled-by-default event intake and scoped venue summaries, including a CSV representation. See [Analytics architecture and HTTP parameters](ANALYTICS_ARCHITECTURE.md).
