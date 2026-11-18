# Phase 11 API contract — A–H

Implemented locally: 11A menus, 11B inventory, 11C ratings/reviews, 11D promotions. 11E–11H are not implemented and have no advertised new endpoints.

| Contract | Responsibility |
|---|---|
| [MENU_MANAGEMENT.md](MENU_MANAGEMENT.md) | Categories/products/variants, public snapshots/images, versioned bulk edits, explicit CSV confirmation, atomic quotas/media lifecycle |
| [INVENTORY_MANAGEMENT.md](INVENTORY_MANAGEMENT.md) | Quantity/status sources, atomic idempotent mutations/movements, public privacy and cafe-scoped deltas/recovery |
| [RATINGS_AND_REVIEWS.md](RATINGS_AND_REVIEWS.md) | Five criteria, author operations, owner replies/reports, admin moderation/audit and incremental summaries |
| [PROMOTIONS.md](PROMOTIONS.md) | Rules/targets/schedules, owner preview, deterministic prices, publication and cache-time evaluation |
| [BEHAVIOR_ANALYTICS.md](BEHAVIOR_ANALYTICS.md) | V2 session/intake, safe owner/admin day/week/month reports, comparisons/CSV, cohort suppression and legacy v1 compatibility |
| [NOTIFICATIONS.md](NOTIFICATIONS.md) | Current-recipient inbox/unread/read/preferences, domain outbox, recipient/marketing policy, cooldowns and budgets |
| [PHASE11_MONITORING_RUNBOOK.md](PHASE11_MONITORING_RUNBOOK.md) | Minimal readiness/correlation and operational metric semantics |
| [RESOURCE_CONTROLS.md](RESOURCE_CONTROLS.md) | Cafe/admin usage, measured/unavailable diagnostics, configuration, optional-work pause and bounded maintenance |

Import [openapi.yaml](openapi.yaml) (JSON syntax, valid YAML 1.2): 53 operations including promotions/readiness. [Postman collection](PHASE11.postman_collection.json): 54 requests including existing cookie login, using local fixture placeholders. Full response field/role/error/realtime semantics are specified in the feature guides; no UI implementation is required. Node SSE inventory stream is explicitly transport-specific; Cloudflare uses the existing browser room.

All new mutations use existing session revocation, same-origin checks, authoritative cafe/author/role checks, prepared SQL, bounded JSON and per-runtime IP limiting. No client-controlled actor IDs, ownership or authoritative prices. No new analytics event collection or statistical dataset should be inferred from menu, inventory or review usage.

Overnight recovery addition: Phase 11D promotions are implemented; see PROMOTION_ENGINE.md for seven endpoints and authoritative unit-price/schedule semantics. GET /api/v1/ready is an additive DB/implemented-schema check, not release approval. Business mutations now recheck role, account version/disabled status, expiry/revoked session and applicable ownership inside the atomic transaction; 409 access_changed requires reload/re-authentication rather than a blind new mutation. Node JSON roots must be objects and same-origin includes effective scheme. No frontend changes required for existing valid requests. E–H remain unimplemented.
