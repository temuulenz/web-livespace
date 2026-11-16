# Phase 11 API contract — current checkpoint

Implemented locally: 11A menus, 11B inventory, 11C ratings/reviews. 11D–11H are not implemented and have no advertised new endpoints.

- [Menu contract](MENU_MANAGEMENT.md): category/product/variant CRUD, stable public snapshot URL, versioned bulk publishing/reordering, explicit CSV confirmation, image operations, auth/validation/cache policies.
- [Inventory contract](INVENTORY_MANAGEMENT.md): availability/quantity sources, idempotent atomic mutations, private history, privacy-filtered public snapshots and cafe-scoped realtime/recovery.
- [Review contract](RATINGS_AND_REVIEWS.md): five criteria, author operations, owner replies/reporting, admin moderation/audit, incremental rating summaries/distributions and maintenance reconciliation.

Import [openapi.yaml](openapi.yaml) (JSON syntax, valid YAML 1.2): 45 operations across 30 paths. [Postman collection](PHASE11.postman_collection.json): 46 requests including existing cookie login, using local fixture placeholders. Full response field/role/error/realtime semantics are specified in the feature guides; no UI implementation is required. Node SSE inventory stream is explicitly transport-specific; Cloudflare uses the existing browser room.

All new mutations use existing session revocation, same-origin checks, authoritative cafe/author/role checks, prepared SQL, bounded JSON and per-runtime IP limiting. No client-controlled actor IDs, ownership or authoritative prices. No new analytics event collection or statistical dataset should be inferred from menu, inventory or review usage.
