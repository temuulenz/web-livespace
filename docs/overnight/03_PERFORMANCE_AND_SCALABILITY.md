# Performance evidence and scope

Baseline and post-change evidence are separated in TEST_RESULTS.md. Existing PHASE11_BUSINESS_D1_MEASUREMENTS.json is historical pre-guard evidence; current local D1/R2 probe output is captured separately as D1_MEASUREMENTS.json when available. Transaction-time assertions add indexed authorization reads and one statement per protected batch, zero assertion row writes. Prepared predicates use existing user/session/cafe keys. This is a justified integrity cost, not a claimed latency optimization.

Existing 12-scenario Phase 7.2 load matrix is applicable to sensor/browser regression and is queued sequentially after integration checks. It does not exercise unimplemented 11D–H or establish production/Free-tier capacity. Existing sensor baseline approximately ten D1 writes/accepted frame remains the planning basis; sensor ingestion was not changed. See FREE_TIER_CAPACITY.md for historical assumptions. No speculative indexes, new caches, cursor/API break, storage service or sensor architecture rewrite introduced. Full Phase 13 and complete business-load scenarios remain TODO. No formal client performance SLO was supplied; local timings are diagnostics only.

## Recorded local results

Committed pre-guard fixture measurements are historical, not a fresh controlled pre-change run. Current direct-service measurements include indexed actor/owner guards; HTTP session and room fan-out costs remain extra.

| Operation | Historical reads/writes | Current reads/writes |
|---|---:|---:|
| product_create | 4/9 | 6/9 |
| inventory_decrement | 15/13 | 17/13 |
| review_edit | 22/20 | 23/20 |
| promotion_create | not available | 104/9 |
| promotion_preview | not available | 98/0 |

All 12 existing local scenarios passed. Last scenario: 10 cafes/500 browsers; API hot p50/p95/p99 5.06/7.03/40.57 ms; realtime p95 590.63 ms; reconnect p95 221.18 ms. Source LOAD_MEASUREMENTS.json includes allocated local SQLite/WAL/SHM size and process CPU where available. R2/KV/analytics/cold-restart assertions also passed. This is a bounded historical-workload regression, not full Phase11 mixed load or production CPU/traffic capacity. No controlled before/after latency improvement is claimed.
