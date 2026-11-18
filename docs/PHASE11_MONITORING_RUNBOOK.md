# Phase 11 monitoring and incident runbook

2026-11-17 checkpoint. Backend monitoring additions are implemented/tested locally. **No hosted monitor, log sink, paging destination or production alert was enabled.** The deployment owner must connect and drill independent monitoring before production GO. [ops/phase11-monitoring.json](../ops/phase11-monitoring.json) is an operator configuration template, not a running service or approved SLA.

## Endpoints and scope

| Endpoint / signal | Behavior | Interpretation |
|---|---|---|
| GET /api/v1/health | Existing minimal liveness retained. Node returns ok when serving; Cloudflare's legacy probe/cache/schema field is preserved for compatibility | Do not infer full Phase 11 readiness from this response or schema:5. |
| GET /api/v1/ready | New uncached no-store public {ready:boolean,api:"1"}; 200 ready, 503 dependency/schema failure | Checks 17 required tables, three key triggers and four application-limit rows; Cloudflare also checks required/feature-enabled binding presence and Phase 11 configuration validity. No SQL/error/tenant diagnostics returned. |
| GET /api/v1/admin/resources/monitor | Existing current admin session; platform application metrics | Runtime counts, latency samples, database/background failures, job freshness and SQL-backed usage/queue age. Not provider billing. |
| GET /api/v1/owner/cafes/{cafe}/resources | Existing owner/admin policy, own tenant for owner | Scoped queue/media/analytics/sensor usage; global DB/jobs/connections remain unavailable to owners. |
| Provider metrics | Separate Cloudflare dashboard/API with approved permissions | Account-wide Workers/D1/DO/R2/KV usage and platform errors, including traffic invisible to this application process. Unverified in this checkpoint. |

Readiness is deliberately a cheap schema/binding canary, not a write/storage roundtrip, exhaustive schema checksum, integrity scan, job/alarm check, R2 object existence test or successful external notification delivery. A binding's presence does not prove remote permission/reachability. Missing schema was fault-injected in local tests. Readiness itself does not migrate, warm collectors or schedule Cloudflare maintenance; warm a normal authenticated API separately and check its alarm/timer. Node readiness can still run when session tables are unavailable and returns a minimal 503. Both adapters apply a separate per-runtime 30/IP/minute readiness limit; use 60-second probes, not aggressive polling.

Cloudflare readiness runs before AppBackend application_limits initialization and bypasses the old health cache. Normal traffic still requires ordered migrations through D1 0016. Optional flag/binding checks include ANALYTICS/BROWSER_ROOMS/MEDIA/PUBLIC_CACHE only when enabled. Production flags and production observability configuration were not changed.

## Structured logs and correlation

shared/operations.mjs defines a fixed output schema. Backend HTTP responses get a server-generated X-Request-ID; incoming request IDs are ignored. Node and AppBackend log 5xx responses by default. LS_REQUEST_LOGS=1 additionally logs completed backend HTTP requests; enabled only in the local staging template. Events contain UTC timestamp, constant event name, server-generated request ID, fixed route group, numeric status/elapsed milliseconds and runtime. Background failure events contain a fixed maintenance/analytics_flush/sessions job name. No raw exception or request object is passed to the serializer.

Excluded fields include full path/query, IP, user/cafe/recipient IDs, headers/cookies/tokens, body, password/hash, SQL/arguments, review text, sensor diagnostics, file paths and exception messages/stacks. Node's old console.error(error) request path was removed. Unit tests send hostile IDs/query markers and verify they cannot enter these logs. Per-request IDs correlate backend HTTP failure reports; this is not distributed tracing through every DO/gateway. Existing sensor/security protocols remain unchanged. The public edge config cache can reuse a response generated earlier; do not treat its cached ID as a complete edge-request trace.

Node logs go to its process stdout; a service supervisor must collect/rotate/access-control them. Cloudflare log statements need an approved deployed observability/log configuration and retention policy to be durable/searchable; checked-in production observability remains disabled. The local staging config enables observability but does not activate a hosted sink. [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) describes provider configuration; review capture fields/sampling/retention/cost before approval, since provider-generated invocation logs are not the application's fixed schema.

## Metric semantics

- runtime.api.requests/errors/server_errors/rate_limit_violations are cumulative in the current runtime. errors includes 4xx/5xx; server_errors counts 5xx. For a five-minute 5xx ratio use counter deltas, minimum 100 requests and reset the baseline on started_at change. Do not use the all-status error_rate as a 5xx ratio.
- p95_latency_ms uses the latest 256 samples; elapsed HTTP/SSE duration is not provider CPU or an account-wide latency histogram. Use request-type and external synthetic checks for SLOs.
- runtime.background exposes runs/failures/last_run_at/last_success_at/last_failure_at for automatic application maintenance. Values reset on restart and are null before a recorded run. Collector failures emit separate analytics_flush failure logs. Node now attempts the independent inbox/resource pass even if optional collector maintenance fails; the combined run still records failure for alerting. These fields do not prove every tenant/collector drained or a job completed after an isolate eviction.
- application_measured includes pending_notification_events, oldest_notification_due_at and notification_overdue_seconds. These are tenant-scoped for owners; future available_at has zero overdue age. Hourly budget deferral can move available_at forward, so this is not total creation-to-delivery latency. Outbox attempts are in-app processing, not email retries. No external provider is configured.
- Analytics usage now uses Asia/Ulaanbaatar midnight, matching intake/evaluation (R13 resolved locally). analytics_day_timezone states this explicitly. sensor_accepted_today retains UTC and is explicitly labelled sensor_day_timezone. Flushed analytics remains a lagged lower bound and is not remaining intake capacity.
- Provider usage, tenant-attributed DB/socket costs and historical connection duration remain explicitly unavailable when unsupported. A null is not zero cost. Never sum per-room caps as account capacity.

The documented map click-to-locate flow also required correcting both response policies from geolocation=() to geolocation=(self). Camera/microphone restrictions and browser consent remain. The isolated synthetic-location browser probe and actual staging HTML policy check validate the header behavior; no location is added to requests, logs or analytics schemas, and no production response policy was deployed. Real map GL/GPS testing remains separate.

## Proposed alert rules and ownership

| Signal | Proposed threshold | Response / owner |
|---|---|---|
| Readiness or HTTPS dependency | Two consecutive failures at 60-second interval, 10-second timeout | Critical; on-call operator checks version/config/dependency before recovery. An independent monitor must run outside the Worker/DB. |
| 5xx ratio | >1% warning, >5% critical over five-minute counter delta with >=100 requests | Backend on-call correlates fixed request IDs/log groups; separate expected auth/rate rejections from server failures. |
| API p95 | >500 ms warning, >2000 ms critical, adjusted after actual hosted baseline | Backend owner profiles representative request families and DB costs; these are proposed pilot alarms, not acceptance SLA evidence. |
| Maintenance freshness | Node >120 s, Cloudflare >1200 s since success; null/eviction requires investigation | On-call verifies warmup, timer/alarm existence, last failures and tenant cursor/queue progress. Typical timers 30 s / idle 15 min. |
| Background failure | Positive failure counter delta or background_failure log | Backend owner investigates sanitized job label, reproduces with synthetic data, retains dirty counters/receipts; no success assumed from retry scheduling. |
| Overdue notification | >300 s warning, >1800 s critical | Backend owner checks oldest due/cooldown/budget and drain rate. Node one-recipient/30 s throughput remains a known constraint; these provisional bounds require workload approval. |
| Application quota | Warning 70%, critical 90%, hard 100%, existing configurable transitions | Admins get deduplicated in-app incidents. Reduce affected optional demand; never indiscriminately disable sensors/security or delete customer data. |
| Provider budget/storage | 70/90% of approved account allocation or explicit lower runway target | Cloudflare operator combines all workloads and monitors daily burn; app estimates are insufficient. No paid upgrade is authorized. |
| Backup freshness | Set only after release owner chooses cadence/RPO | DB/release operator watches last verified private backup and restore rehearsal; an export exit status is insufficient. |

## Incident procedure and drill

1. Record UTC incident start, environment, approved release/config identity and nonsecret X-Request-ID. Do not paste headers/bodies/SQL/errors or credentials into tickets/logs.
2. Check independent readiness/liveness plus an authenticated canary and provider status/usage. Determine whether the problem affects schema, permission, media, collectors, queue or essential telemetry. Separate process reset/unavailable attribution from zero usage.
3. For quotas, use the documented admin optional analytics pause or approved flag/config rollback; preserve dirty collectors and all correctness receipts. Increase no plan or limit without approval. For real sensor failures verify absence of successful ACK and retain client outboxes.
4. For queues, inspect due age/recipient budget/preferences/scheduled available_at and bounded progress. One admin maintenance call is one bounded step. Do not run unbounded maintenance bursts to hide a backlog, delete outbox rows or turn off marketing consent checks.
5. On auth/tenant leak or durable commit inconsistency, contain affected writes and escalate to security/backend/release owner. Use the reviewed compatible recovery artifact; no down-migration/reset/reseed. Follow PHASE11_ROLLBACK_PLAN.md for identity/media/DO consistency.
6. Drill on isolated staging: drop a required trigger and restore it, inject SQL/storage failure, observe 503/minimal body and fixed log/correlation, create an overdue synthetic event, force a job error and confirm age/failure visibility, test independent alert delivery/acknowledgement and recovery. Backend unit/Cloudflare probes cover local signals; **actual monitor-to-responder delivery/acknowledgement remains manual and unverified**.
7. Close only after authorized version/schema/config, durable idempotency/media/tenant canaries, job/queue progress and account headroom are healthy. Record measured recovery/loss and assigned follow-up; /health alone cannot close an incident.
