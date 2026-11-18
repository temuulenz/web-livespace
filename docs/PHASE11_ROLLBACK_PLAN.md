# Phase 11 rollback and recovery plan

2026-11-17. Production is **NO-GO** pending the deployment-review gates. This plan is for a future authorized operator; no deployment, production backup/restore, namespace change or production data mutation was performed. Production recovery actions require separate authorization and a named incident owner. Local Node storage is not a synchronized Cloudflare failover database.

## Required recovery package before rollout

- Record current/candidate Worker version IDs, source/config/asset checksums, D1 migration ledger, Node version/schema, cumulative DO migrations and bindings, media locations and effective environment settings. Do not infer the current version from historical reports.
- Keep a tested private pre-release backup/export plus a tested post-migration recovery copy, restore instructions, integrity/count/checksum evidence and actual RTO/RPO observations. Agree acceptable RTO/RPO explicitly; none is specified by the Phase 11 acceptance document.
- Prepare an exact compatible code recovery artifact and a separate service-shutdown/static-fallback artifact. Both must retain the cumulative SensorGateway, AppBackend, BrowserRoom and AnalyticsAggregator class/binding history. Preserve MEDIA read binding whenever any R2-only image exists, even with LS_R2_MEDIA_ENABLED=0.
- Rehearse those artifacts against a restored upgraded dataset and existing namespace identities in isolated staging. New SQL notification triggers still execute when older code writes; additive tables alone do not prove that arbitrary old code is safe. Preserve current access-control/Super Admin enforcement.
- Identify operators for stopping/restarting ingestion, controlling deployment automation, notifying affected users through approved channels, inspecting monitoring, authorizing data restoration and recording losses/reconciliation. This document does not send messages or change pipelines.

## Recovery triggers

Pause rollout and assess immediately on tenant/private-data exposure, writes after authority revocation, duplicate durable stock/sensor effects, ACK before persistence, migration/integrity failure, inaccessible referenced media, systemic 5xx/dependency failure, queue growth exceeding the agreed drain/latency bound, or account quota consumption exceeding the approved budget. Use independent monitoring: an in-app alert cannot be the only signal of DB/Worker failure.

Capture sanitized evidence first: UTC time, deployed version/config, affected routes/tenants, correlation/event IDs and aggregate error/queue/provider metrics. Do not include passwords, bearer tokens, cookie values, hashes, review text or private diagnostics. Minimize exposure by stopping affected writes/traffic; preserve databases and durable namespaces for investigation.

## Prefer compatible code recovery

1. Stop optional producers and pause rollout. Analytics controls only stop optional collection; they do not disable all jobs, notifications, stock or security. There is no global notification-worker shutdown flag. For wider containment stop writers/clients or use a reviewed service-shutdown artifact. Do not invent environment switches.
2. Suspend simulators/physical clients gracefully where required; retain device/client SQLite outboxes and unchanged message IDs. A client must not drop pending readings merely because the service is unavailable. Stop browser event producers before disabling analytics flushes if draining is required.
3. Capture a fresh consistent recovery point if safe, including post-release writes, so rollback is not an excuse to discard them. Record pending collectors/outbox counts and media pointers. D1 and DO/R2 snapshots are separate consistency domains.
4. Choose the pretested compatible artifact. Worker version rollback is possible only when platform migration/binding compatibility allows it. A future command has the form `npx wrangler rollback RECORDED_COMPATIBLE_VERSION_ID --name livespace`; do not substitute an unreviewed old/static version or run this during review. Confirm the exact CLI syntax/version and target first.
5. If direct version rollback is disallowed or semantically unsafe, deploy the preapproved forward-recovery artifact preserving current migrations/classes/read bindings. Do not remove namespaces or migration tags to bypass platform restrictions.
6. Keep the additive D1 schema through 0016 and Node schema 12. Never run destructive down-migrations, drop tables, reset the database, delete immutable audit/receipt rows or reseed. Retain all original media and pending journals/tombstones.
7. Verify HTTPS/config plus actual menu/stock/review/report/inbox/auth/tenant canaries, private media/ETag denial and maintenance liveness. Confirm stable retry identities produce duplicates, not second mutations. Resume a limited flow of explicitly simulated testing only where authorized; never manufacture real readings.
8. Resume normal producers gradually while observing queue age, sensor ACK/reconnect/freshness, rates/CPU/storage/row costs and errors. Restore optional features only under the approved configuration. Record the recovered version, known limitations and reconciliation work.

## Existing recovery files are not a certified Phase 11 rollback

wrangler.recovery.jsonc is historical and lacks later cumulative namespace history; it may also depend on local backup assets. Do not execute it as the Phase 11 plan.

wrangler.phase72-recovery.jsonc preserves all four current class migrations, but main points at current cloudflare/worker.mjs. It disables browser realtime/new R2 writes/KV/analytics; it continues backend/domain operations and maintenance and therefore is **feature shutdown, not code rollback**. It currently has no MEDIA binding. If R2-only data exists, that absence makes it unsuitable unchanged. Flags do not remove trigger/schema compatibility obligations. It must be reviewed against the actual binding inventory and rehearsed before use.

A static-fallback recovery build must return a clear backend-unavailable response and preserve namespaces/data/read paths as appropriate. Static/demo behavior is not equivalent to restoring accounts, owners or live service; do not present illustrative seats/forecasts/customer mock data as real restored telemetry/business state.

## Database restoration — exceptional last resort

Code/config recovery should normally preserve newly committed data. A database restore loses accepted post-backup changes and can desynchronize D1 from DO counters/receipts/R2. It requires a separately authorized recovery point and reconciliation plan, not an automatic fallback command.

**Node**: stop the process and all writers; preserve the entire failed data directory and any separate LS_DB_FILE for investigation. Restore into a new private directory from the tested consistent backup, including main SQLite, collectors and uploads. Do not merge unrelated WAL files with a restored main file. Verify integrity_check, foreign_key_check, expected schema, critical counts, quotas/ratings and file hashes. Start the compatible artifact against the restored copy on isolated networking, run canaries and verify replay semantics before switching traffic. Keep the failed copy and backup unchanged.

**Cloudflare**: stop writers and inventory the proposed D1 Time Travel/export recovery point, relevant DO state and object versions. Validate restoration into an isolated resource first. D1 recovery does not roll back DO namespaces or R2. Restored lower aggregate revisions can be repopulated from surviving collectors; restored stale stock/sensor receipts can permit duplicate effects unless identities are reconciled. If notification delivery receipts are lost, previously delivered events may redeliver. Retained outbox events must resolve recipients under current restored authorization. Do not restore production until these effects and the approved loss window are understood.

Use the account's current supported D1 recovery tooling with a reviewed bookmark/export and explicit target; no general-purpose destructive import/Time Travel command is provided as a safe default. Preserve all immutable audit/dedup identities that can be recovered, and never regenerate device IDs/message IDs or credential values. Reconcile D1 pointers with R2 byte manifests; never delete objects just because a partially restored database no longer references them.

After any restoration, check counts/integrity, enabled users/roles/Super Admin binding, owner assignments, session invalidation policy, device assignment/revocation, sensor/inventory retry receipts, stock movements/revisions, review summaries, promotion schedules, analytics monotonic revisions, queue/delivery/read state and media. Validate source labels/timezone boundaries. Record exactly which accepted writes are missing; do not claim zero data loss without evidence.

## Recovery completion criteria

Recovery is complete only when critical authorization/tenant/commit/idempotency/media tests pass, the selected code/schema/config are compatible, jobs and queues have resumed safely, independent monitoring is healthy, account usage fits the approved limit and the release owner accepts the documented data loss/reconciliation result. Keep evidence and preserved failed state under private retention policy. A healthy `/health` alone is insufficient.
