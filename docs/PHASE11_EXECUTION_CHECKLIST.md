# Phase 11 execution checklist — local closeout

Acceptance authority: PHASE11_ACCEPTANCE.md, approved 2026-11-17. This supersedes the earlier unavailable-policy blocker; original A–D were preserved. PHASE11_PROGRESS.md contains the historical/resumable work log, and PHASE11_REPORT.md records final scope, commands, measurements and deployment prerequisites.

| Phase | Status | Implementation / dependencies | Security and acceptance evidence |
|---|---|---|---|
| 11A | COMPLETE locally | Menu/variants/import/media, counters, staged storage/reconciliation | Atomic quotas, tenant/media validation, races/faults, original constraints and fixture preservation |
| 11B | COMPLETE locally | Stock/movements/receipts/realtime snapshots | Versions, nonnegative stock, source constraints, tenant isolation, idempotency and rollback |
| 11C | COMPLETE locally | Reviews/replies/reports/moderation/incremental summaries | Author/owner/admin separation, privacy, race/rollback/repair |
| 11D | COMPLETE locally | Promotion rules/schedules/targets, preview and prices using A menu IDs | UTC/local recurrence, deterministic rounding/overlap, owner fences, quotas, cache transitions and D1 parity |
| 11E | COMPLETE locally | Existing collector extended with v2 events/pseudonyms/dimensions/cohorts, Node recovery, retention | Strict metadata/references, server time, shared tenant budgets, dedup/flush failures, session caps, restart recovery |
| 11F | COMPLETE locally | E plus sensor/history/current business records; local periods/comparisons and aggregate CSV | Owner/admin authorization before cache hits, small cohorts/keys omitted, no raw exports, real/simulated/invalid/stale distinctions, bounded output |
| 11G | COMPLETE locally | Existing domain transactions plus persistent outbox/inbox/preferences and maintenance | All nine trigger families, current recipient/marketing fences, durable dedup, incident/cooldown/budget races, cross-user read denial |
| 11H | COMPLETE locally | Reused instrumentation/admission plus scoped configuration/controls and resource incidents | Media/CSV hard fences, quota escalation/dedup, reserved-scope isolation, independent tenant warnings, measured versus provider-unavailable diagnostics |

Validation: npm ci; npm test; npm run test:sensors; npm run test:browser; npm run test:e2e; npm run test:visitor-visual; npm run test:visual; npm run test:cloudflare; npm run cf:check (dry-run); node scripts/phase11-d1-check.mjs; node scripts/phase11-menu-demo.mjs; node scripts/phase11-menu-budget.mjs; node scripts/phase11-load.mjs. Exact counts/environment/results are in the report/progress. Native syntax/JSON/whitespace checks passed. No lint/typecheck/frontend production build scripts exist. External map reachability remains unavailable in the browser suite's unchanged conditional check; SVG fallback is verified.

Remaining deployment prerequisites are operational review, coherent pilot configuration, account usage/budgets, backup/additive migration/recovery rehearsal and separately authorized frontend/staging/production integration. They are not unimplemented backend subphases. No deployment, remote resource creation, paid plan, destructive data/Git action, unrelated phase or frontend redesign is authorized by this checkpoint.
