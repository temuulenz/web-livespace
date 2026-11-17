# Phase 11 additive database changes

| Feature | Node schema version | D1 migration |
|---|---|---|
| Menu | 5 | 0009_menu.sql |
| Menu quotas/media staging | 6 | 0010_menu_hardening.sql |
| Inventory | 7 | 0011_inventory.sql |
| Reviews/ratings | 8 | 0012_reviews.sql |
| Promotions | 9 | 0013_promotions.sql |

Node startup applies ordered transaction-wrapped migrations from server/lib/db.mjs. D1 files are applied only to disposable local persistence in validation. No remote migrations were run. Promotion schema is shared verbatim with D1, verified by a parity test. It adds tenant-scoped promotions, composite product/category references, an indexed publication/schedule lookup and an atomic 100-rule tenant capacity trigger. Existing tables and stable menu IDs remain compatible; no destructive migration or data reseed.

The pre-Android v1 fixture is unchanged. Its upgrade test now expects Node version 9. Before a separately authorized deployment, inspect current remote migration state, back up and rehearse additive upgrades on representative data; retain all cumulative Durable Object migrations and media read bindings. Recovery means compatible code/feature shutdown retaining additive data, never down-migration or dropping tables. New code that projects promotions requires migration 0013 before serving menu requests.

## E–H approved extension

Node 10 / D1 0014_behavior.sql adds dimensional aggregate/session-day/cohort summaries and time indexes; Node uses the same collector algorithm in per-cafe durable SQLite storage. Existing AnalyticsAggregator storage initializes its additive receipt/counter/member tables on resume; frozen v1 sensor protocol/schema fixture unchanged. Node 11 / D1 0015_notifications.sql adds persistent inbox/preferences, transactional outbox/domain triggers, delivery receipts, cooldowns/budgets and sensor incident state. Node 12 / D1 0016_resources.sql adds resource incidents/cursor, optional-work controls and configured lower media/CSV limits. Configured media fences run BEFORE reservation and defer unchanged default upper caps to original constraints. All three shared schemas have verbatim D1 parity tests. No down-migration or destructive content change. Existing databases must receive ordered additive migrations before new APIs/collector flushes are enabled; backup/compatible recovery review remains a deployment prerequisite.
