# Phase 11H resource monitoring and configuration

GET `/api/v1/admin/resources/monitor` reports platform application usage, ephemeral runtime counters, background failures and explicit provider-billing unavailable status. GET `/api/v1/owner/cafes/{cafe}/resources` (or admin equivalent) restricts data to that cafe; platform DB/runtime connection attribution is unavailable to owners. Public `/health` remains minimal. Existing `/admin/resources` diagnostics remain backward compatible and Super Admin scoped; the new monitor accepts authorized platform admins.

Metrics distinguish runtime counters (reset on restart), authoritative SQL snapshots and lagged flushed analytics totals. API count/error/rate-violation/latency measurements are bounded; latency quantiles use the most recent 256 observations. Node wraps existing prepared statements without storing SQL text/arguments. Cloudflare reuses D1 metadata and measured DO operations. Storage reports reserved media bytes; Node additionally reports SQLite allocated pages; provider database storage/billing is null when unavailable. Sensor accepted counts/connectivity, queue size and scoped media usage use existing records; accepted sensor counts describe durable measurements rather than heartbeat pings. Tenant-attributed connection/DB costs and global hibernating socket counts are null where unavailable; per-gateway diagnostics remain on the existing admin interface. No Cloudflare billing/account API is assumed.

Global/tenant media bytes/images, flushed analytics intake totals and maximum recipient notification budget generate durable threshold incidents. Warning defaults 70%, critical 90%, hard 100%; recovery begins a new incident episode, repeated same levels deduplicate, and escalation has its own severity. Flushed analytics is a lagged lower bound; hard admission remains at the durable collector. One tenant is checked per step using a durable cursor; Cloudflare quickly continues through a full round then idles up to 15 minutes. Platform checks run at the beginning of each round. API/rate and connection caps enforce synchronously using existing admission windows; no provider-wide quota promise is made. Rate maps are ephemeral security state and contain no retained browsing histories.

PATCH `/api/v1/admin/resource-controls` or `/api/v1/admin/cafes/{cafe}/resource-controls`, body `{analytics_paused:boolean}`, pauses only optional collection. Values persist with actor/time. Owners cannot pause workloads. Existing security/auth/telemetry endpoints retain their dedicated limits; a generic browsing limit never disables essential sensor/security work. Errors 429 rate/budget, 503 pause/connection capacity, 409 configured media quota, 422 invalid bounded input. No automatic customer-content deletion or paid resource enablement.

Environment defaults (validation rejects invalid values):

| Setting | Default / bounds |
|---|---|
| LS_INSIGHTS_REQUESTS_PER_MINUTE | 60/IP; 1..10000 |
| LS_ANALYTICS_ENABLED | 0; explicitly enable pilot only |
| LS_ANALYTICS_DAILY_EVENTS | 1000/cafe/local day; 1..100000 |
| LS_ANALYTICS_SESSION_EVENTS | 100/session/local day; 1..10000 |
| LS_ANALYTICS_BATCHES_PER_MINUTE | 20; 1..1000 |
| LS_ANALYTICS_RETENTION_DAYS | 90; 7..365 |
| LS_ANALYTICS_RECEIPT_DAYS | 2; 2..7 |
| LS_ANALYTICS_MIN_COHORT | 5; 3..100 |
| LS_ANALYTICS_RANGE_DAYS | 31; 1..93 |
| LS_ANALYTICS_PAGE_SIZE | 100; 1..100; other existing business pages retain their 100 hard cap |
| LS_NOTIFICATION_DAILY_LIMIT | 100/recipient/UTC day; 1..10000 |
| LS_NOTIFICATION_COOLDOWN_SEC | 3600; 0..86400 |
| LS_NOTIFICATION_RETENTION_DAYS | 90; 7..365 |
| LS_PROMOTION_REMINDER_HOURS | 24; 1..168 |
| LS_BACKGROUND_BATCH_SIZE | 20; 1..20; recipient fan-out one; dimensional flush <=10 per table |
| LS_RESOURCE_WARNING_PERCENT / LS_RESOURCE_CRITICAL_PERCENT | 70 / 90; warning must be below critical |
| LS_API_USER_PER_MINUTE | 600; 10..10000 |
| LS_API_TENANT_PER_MINUTE | 1200; 10..20000 |
| LS_API_ANONYMOUS_PER_MINUTE | 300; 10..10000 |
| LS_BROWSER_MAX_CONNECTIONS | 500; 1..10000; Node SSE/server, Cloudflare per cafe room |
| LS_MENU_IMAGE_BYTES | 1048576; 1024..1048576 |
| LS_TENANT_MEDIA_BYTES | 20971520; 1024..20971520 |
| LS_CSV_IMPORT_BYTES / LS_CSV_IMPORT_ROWS | 12000 / 20; lowerable to 100 / 1 |

Existing LS_SENSOR_RATE_PER_MINUTE, LS_SENSOR_MAX_CONNECTIONS, LS_SENSOR_EXPECTED_INTERVAL_SEC, LS_SENSOR_STALE_AFTER_SEC, LS_DEVICE_OFFLINE_SEC and Node partner-photo controls remain authoritative. Frozen hard media quotas remain upper ceilings; configurable lower media bounds are enforced by SQL before a new reservation. Concurrent writes cannot bypass them. Configuring a lower cap never deletes prior content. CSV schema/security remains unchanged, with extra lower bounds from application_limits. Sensor frequency means accepted message-rate admission, not silently changing client cadence or protocol.

Default limits suit a small pilot; they are not account billing caps. Maintenance uses bounded batches and a round-robin tenant cursor; normal API requests do not perform an unbounded sweep. Cloudflare aggregate flush and maintenance are kept below the existing per-invocation query budget. Optional work backs off on quota/storage failures, persists retries and reports failures in runtime diagnostics. The legacy D1 circuit breaker and durable telemetry failure/ACK rules remain intact. See exact local measurements and workload limitations in PHASE11_REPORT.md before any separately authorized deployment review.

## Production readiness checkpoint additions (2026-11-17)

GET /api/v1/ready is a minimal uncached schema/binding canary (200/503); legacy /health remains compatible. See PHASE11_MONITORING_RUNBOOK.md for limitations. Backend API responses carry server-generated X-Request-ID. Optional LS_REQUEST_LOGS=1 enables fixed-schema completed-request logs; 5xx/job failures are logged by default without raw requests/errors/SQL/identities. No deployed log sink or independent alert service was activated.

Runtime API metrics add server_errors (5xx); background metrics add last_run_at/last_success_at/last_failure_at, reset with the runtime. Scoped application metrics add oldest_notification_due_at and notification_overdue_seconds (based on available_at, not total delivery latency). Analytics “today” now uses Asia/Ulaanbaatar, explicitly analytics_day_timezone; sensor counts retain sensor_day_timezone UTC. Flushed events remain a lagged lower bound. No extra per-telemetry writes, dependency or schema migration was introduced.
