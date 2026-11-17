# Phase 11 API contract — A–H

All eight backend subphases are implemented locally against PHASE11_ACCEPTANCE.md. No deployment is authorized. Existing Android v1 and legacy HTTP ingestion remain compatible.

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

[openapi.yaml](openapi.yaml) uses JSON syntax valid as YAML 1.2 and contains 71 operations across 54 paths. [PHASE11.postman_collection.json](PHASE11.postman_collection.json) contains 72 requests including existing login, with local fixture placeholders. The linked feature guides define full request/response/role/error/source/cache/retention semantics and examples.

Private APIs reuse current cookie sessions and authoritative cafe/author/admin/recipient checks. Same-origin writes, prepared SQL, strict payload whitelists, bounded bodies/rates/pages and atomic version/audit/idempotency guards remain server-side. No client-provided actor/ownership/recipient is trusted. Public projections omit credentials, private diagnostics and individual behavior; low analytics cohorts/keys never enter CSV. No researcher role/raw behavior export, orders/payments/sales conversion API or external messaging provider was introduced.

Node inventory realtime uses its existing scoped SSE endpoint; Cloudflare uses cafe browser rooms. Private notifications use HTTP polling and never public SSE. Frontend integration remains separate; see FRONTEND_INTEGRATION_GUIDE.md. Local schema/migration/testing/deployment prerequisites are in PHASE11_REPORT.md and PHASE11_MIGRATIONS.md.
