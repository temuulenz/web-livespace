# Phase 7.2 capacity and operating budgets

Local preparation dated 2026-11-16. These are account-wide planning ceilings, not a guarantee of free operation. No remote resources or plans were changed. Analytics, R2 writes and KV remain disabled in the checked-in configuration.

## Official limits verified for this review

| Resource | Free allowance | Internal target |
| --- | --- | --- |
| Workers | 100,000 requests/day; 10 ms CPU/request | <50,000/day; aim <5 ms CPU |
| D1 | 5 million rows read/day; 100,000 written/day; 5 GB total; 500 MB/database | <2.5 million; <50,000; <250 MB for the existing database |
| SQLite DO compute | 100,000 requests/day; 13,000 GB-s/day | <50,000; <6,500 GB-s |
| SQLite DO storage | 5 million rows read/day; 100,000 written/day; 5 GB total | <2.5 million; <50,000; <2.5 GB |
| KV | 100,000 reads/day; 1,000 writes/deletes/lists each/day; 1 GB | <50,000 reads; 400 write attempts; <0.5 GB |
| R2 Standard | 10 GB-month; 1 million Class A and 10 million Class B operations/month | <5 GB-month; <500,000 A; <5 million B |
| Cron | 5 triggers/account; 10 ms CPU/invocation on Free | No cron introduced |

The existing single D1 database must stay below its separate 500 MB Free database ceiling; account storage headroom cannot raise that ceiling. See [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/). DO alarms count as requests; each setAlarm counts as a row written; index changes and deletes also consume writes. Incoming WebSocket messages have provider-specific request accounting; outgoing fan-out is not one Worker invocation per recipient. Hibernation avoids idle duration billing only while the object is actually hibernating. Local tests cannot prove that billing state.

## Measurements and projections

`node scripts/d1-read-budget.mjs` measures local D1 row metadata against 10,000 disposable readings. The optimized summary retains four reads and empty legacy lookup zero. `npm run cf:write-budget` measures ten writes per accepted uncalibrated observation, with duplicates/control pings requiring no telemetry writes. These costs exclude other endpoints, authorization, DO storage and retention.

| Sensors | Cadence | Telemetry D1 writes/day | Under 50,000 target? |
| --- | --- | ---: | --- |
| 1 | 30 seconds | 28,800 | Yes, before other writes |
| 3 | 60 seconds | 43,200 | Limited headroom |
| 5 | 60 seconds | 72,000 | No |
| 10 | 60 seconds | 144,000 | Exceeds hard limit |

Ten continuously reporting sensors need cadence longer than 173 seconds just for telemetry to fall below 50,000 writes/day; choose additional margin for replay and management, and deliberately configure expected cadence and stale thresholds together. No cadence is silently changed by this patch. Calibrated SPL may add index writes. At the existing 15-second cadence, even one sensor uses 57,600 writes/day.

For 100/500/1,000 daily users with one 30-minute visible session, ten-second polling costs 18,000/90,000/180,000 live requests/day. Three cafe subscriptions/session with 10% reconnect overhead project 330/1,650/3,300 upgrades/day. At ten other dynamic requests/user, projected browser dynamic requests become 1,330/6,650/13,300/day. Sensor upgrades, recovery, images, owner tools, cold histories and abuse are extra. Static asset-first requests bypass Worker code. These are workload assumptions, not measured daily production totals.

The local matrix script tests 1/3/5/10 cafes and corresponding sensors with 50/100/500 simultaneous browsers, reconnect waves, duplicate sensor replay, owner requests, R2 image authorization/ETags, KV cold restart and analytics bursts. See `.artifacts/phase72-load.json` and the Phase 7.2 report for measured timing and completion status. It is a short load test, not a 24-hour soak or proof of internet delivery latency. Browser concurrency is independent of daily active users.

Local allocated D1 storage growth is obtained from SQLite/WAL/SHM file sizes in the disposable persistence directory. PRAGMA page_count is not permitted by the D1 authorizer, and the Wrangler CLI omits size_after metadata for this probe. File sizes include WAL allocation and do not measure logical production database size. Local process CPU seconds include workerd overhead and cannot establish the deployed 10 ms per-request limit. Memory counters and query latency rings exposed through authorized `/api/v1/admin/resources` are diagnostic samples, not account billing totals. DO SQL cursor row counts and alarm write attempts must be reviewed alongside D1. The 1,000-event/cafe/day analytics admission bound does not guarantee the account-wide DO write budget for ten cafes.

## Degradation and rollout gates

Disable optional analytics first; keep R2/KV opt-in. D1 quota failures return explicit `d1_quota_exhausted`, 503 and Retry-After, with 15-minute backoff. Sensors receive storage_failed without accepted ACK, retaining replay obligations. Previously loaded real readings age normally; cached information must not be relabelled fresh. Physical Android retry/outbox behavior remains unverified.

Before rollout, review actual account usage and migration scan cost, set fleet cadence, reserve replay budget, and monitor real CPU/duration/storage. R2 application limits cannot guarantee zero charges. Do not enable billing or paid plans as a workaround. No remote benchmark or production traffic was generated for this review.
