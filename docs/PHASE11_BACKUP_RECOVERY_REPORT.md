# Phase 11 backup and recovery validation

2026-11-17 checkpoint. **Local synthetic recovery only. No production export, backup, restore, data modification or hosted restore was performed.** Current production recovery remains unverified. Existing [rollback plan](PHASE11_ROLLBACK_PLAN.md) still governs any future authorized recovery.

## Implemented tooling and safety boundary

scripts/lib/phase11-backup.mjs implements offline full-directory snapshots and verification. It requires the explicit offline:true assertion, a `livespace-phase11-synthetic` marker, a new separate destination and no symlinks/overlap. Copies use private directories/files (0700/0600). It does not connect to Cloudflare or accept a production mode. The marker is an accidental-target guard, not proof a process is stopped; the caller/operator must stop every writer. No online/multi-writer consistency claim is made.

The inventory records SHA-256 file checksums, complete table row counts/content digests, schema-object digest, index/trigger counts, user_version, integrity_check and foreign_key_check for every SQLite file. Record values, password/token hashes and private bytes are never printed; private backup manifests contain digests, not source rows. Nonempty WAL files are part of the offline copy; rebuildable SHM and empty WAL are ignored. Read-only SQLite inspection can create empty sidecars. All inspection handles close before the next snapshot step. Large integer metadata uses SQLite BigInt mode rather than lossy JavaScript numbers.

The tool is deliberately for bounded synthetic/staging datasets: it computes complete record digests in memory and is not yet a production-scale streaming backup utility. Encryption, independent off-host storage, retention, monitoring, key custody and production RPO/RTO remain operator obligations.

## Node rehearsal

Command: `node --disable-warning=ExperimentalWarning scripts/phase11-backup-rehearsal.mjs`.

Creates private mkdtemp source/backup/restored directories and deletes only its own temporary tree afterward. It uses real application migrations to schema 12, existing business services and the actual filesystem media adapter. Synthetic data includes users/roles, an active demo cafe, published menu/category, image bytes, stock/movement/permanent retry receipt, review/rating aggregates, promotion, notification intents/inbox/read/preferences, simulated measurement and sensor receipt, and **accepted but unflushed analytics in a separate collector SQLite file**.

The app closes before snapshot. Restored file/record/schema inventories must match exactly before application startup. After restart the script checks stock quantity, permanent stock duplicate behavior, preserved sensor message identity, pending analytics duplicate/recovered flush and actual media readability. Existing protocol tests independently check durable ACK/replay; this snapshot script does not fabricate a physical device or claim hardware testing.

Final local Node run: **passed**. Two SQLite databases (main plus pending collector), schema **12**, **138 schema objects / 36 explicit indexes / 55 triggers** in the main database. Backup copy+inventory verification **29.10 ms**; restored copy+verification **51.52 ms**; restore through application/domain/media/collector readback **58.39 ms**. File/record/schema equality, integrity, foreign keys, inventory retry, sensor receipt identity, pending analytics, media readability and notification inbox/read/preferences checks all true. These tiny local intervals exclude production quiescence, network transfer, incident response and real-volume recovery. Evidence: `.artifacts/phase11-node-recovery.json` and `phase11-node26-recovery.json`. A separate official Node 22.13.0 minimum-version run also passes all checks (backup 38.77 ms, copy/verification 64.36 ms, domain readback 74.67 ms); evidence `phase11-node22-recovery.json`. These are individual runs, not latency percentiles.

## Cloudflare local workerd and D1 rehearsal

Command: `WRANGLER_SEND_METRICS=false node scripts/phase11-staging.mjs rehearse`.

The runner validates wrangler.staging.jsonc has no production account/ID/routes/external bindings, applies the actual 16 ordered D1 migrations with the Wrangler local migration ledger, and seeds only synthetic staging users/cafes. It exercises disabled/enabled analytics, cookie auth, owner isolation, public menu/stock, image storage, durable stock retry, private resource/readiness APIs and bounded maintenance. Local runtime configuration is regenerated from the validated staging template, not trusted from a copied arbitrary config.

All local workerd processes stop before full-state copy. The directory backup includes D1 plus the **local emulation** of AppBackend/AnalyticsAggregator DO SQLite state, blobs, private fixture credentials and configuration. Restored inventory equality is checked before any new job can mutate it, then real restored HTTP domain/image/intake readback runs. This validates local emulation namespace recovery only; hosted DO backup/export is a separate unresolved question.

The script also exports actual local D1 to SQL and restores into an empty isolated D1. During development, a naive `wrangler d1 execute --file dump.sql` restore failed with **foreign key mismatch: inventory referencing menu_item_variants**. Composite parent uniqueness is supplied by an index that the exporter can emit after child rows. A dump exit status alone therefore did not establish restore capability.

The rehearsal now classifies the trusted local dump using Wrangler's SQL splitter, creates all table/index/view definitions first, defers foreign keys for the row batch, imports rows, then creates triggers. Triggers must not run while importing already-materialized quota counters, rating aggregates or notification events. The script fails closed on unsupported statements. It compares selected business/migration row counts, all exposed schema-object names, foreign_key_check and rejection of an invalid composite reference. Full state-copy verification additionally compares every SQLite table's record/schema digests and every stored file checksum. This bounded local restore implementation is **not authorization or tooling approval to rearrange/import a production dump**; production size, virtual tables, SQL variants and provider batch/import limits need separate rehearsal.

Wrangler 4.162.0 `d1 export --local` does not accept --persist-to. The runner deliberately uses `.wrangler/state` relative to its isolated config so export targets the right local database, while migration/dev/proxy paths explicitly point to the same location. getPlatformProxy uses the versioned `state/v3` path and remoteBindings:false. No path is redirected to production and no remote flag exists in the runner.

Local workerd run: **passed 35 smoke checks** (13 baseline-off, 11 enabled, 11 restored-enabled), including exact original image bytes over HTTP and current ETag 304. Full copy inspected **16 SQLite files**, including local runtime metadata; D1 held **145 schema objects / 38 explicit indexes / 55 triggers**. All copied files and every table's record/schema digests matched; integrity/FK checks passed. Separate D1 export/import counts, representative product/stock/receipt/image-byte records, schema-object names and invalid-FK rejection all passed. Backup copy+verification **247.78 ms**; restored copy+verification **271.97 ms**; restore through actual HTTP runtime readback/shutdown **3254.88 ms**. Separate local D1 export/import/schema/constraint verification **6701.68 ms**. Total synthetic workflow **35.09 s**, not a production RTO. Evidence: `.artifacts/phase11-staging-rehearsal.json`.

The stronger restored-image check additionally exposed a backend fallback defect: a raw D1 binary array could yield an empty HTTP 200 body. Cloudflare now converts it to Uint8Array, fails closed on absent/truncated bytes, and versions the opaque D1 validator to refresh any formerly cached empty body. Tests now compare exact private/public/restored bytes and verify an old validator receives a fresh 200. This corrected representation, rather than HTTP status alone, is part of current recovery evidence.

## Recovery limitations and remaining production actions

| Requirement | Checkpoint result | Required owner/action |
|---|---|---|
| Fresh schema/constraints/index/record preservation | Locally checked with exact inventories, integrity/FK checks and domain readback | Backend owner preserves scripts/tests; database owner repeats on approved representative copy |
| Consistent main DB + collectors + media | Offline synthetic Node and local workerd state copies | Operator must stop writers and cover separate production LS_DB_FILE, DO namespaces and object storage |
| Production D1 export/Time Travel | Not executed, credentials unavailable | Cloudflare/database operator records ledger/bookmark and authorized private export, then validates isolated recovery |
| Hosted DO pending/replay/admission state | Local emulation only; no hosted namespace snapshot procedure established | Cloudflare operator establishes recoverable consistency plan; prefer compatible code recovery retaining namespaces |
| R2-only image bytes | Existing separate local D1/R2 fault suite; this staging config has R2 off/D1 bytes | Storage operator inventories and backs up any actual R2-only objects; retain read bindings during rollback |
| Production recovery artifact | No approved exact prior-code recovery artifact was available | Release owner packages/test compatible version with all cumulative classes/bindings; old recovery files remain insufficient |
| RTO/RPO/backup cadence | Measured small local intervals only; no production SLA accepted | Product/release/database owners choose acceptable loss/time/cadence and drill with real size/network boundaries |
| Off-host encrypted retention and alerting | No service activated | Operator selects approved storage/key/retention and monitors last verified backup/restore; never publish dumps |

As checked on 2026-11-17, [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) lists seven-day Free versus 30-day Paid Time Travel. [Time Travel documentation](https://developers.cloudflare.com/d1/reference/time-travel/) describes supported point-in-time recovery; verify the actual account and bookmark before use. D1 recovery covers D1, not DO namespaces or R2. A post-backup accepted sensor/stock effect can duplicate if restored receipts are stale; an analytics collector can repopulate aggregates from a different point; lost notification deliveries can redeliver. Never claim zero loss from a D1-only export or remove correctness receipts to save space.

Production recovery cannot be signed off until representative private backups, exact compatible code/config artifacts, hosted consistency handling, authorized restore rehearsal and a responder-owned RTO/RPO are evidenced. No destructive down-migration, reset, reseed or production import was attempted.
