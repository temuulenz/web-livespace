> Current recovery rerun: branch main, initial working tree clean. Recovered previous checkpoint from local commit f81abe9 using read-only git show and targeted working-tree edits. No branch switch/cherry-pick/commit. Newer cafe ownership code/tests and map CSP preserved. Fresh baseline154 Node; restored/integrated final176 pass. Older phase7_11 facts below are historical.

# Baseline and recovery

Observed 2026-11-18: branch phase7_11, clean working tree and index. Repository guidance read. Actual code/docs contain Phase 11A menus, 11B inventory, 11C reviews; additive Node schema 8 and D1 migrations through 0012. Existing ws-only runtime dependency, Node HTTP/SQLite fallback, Workers/D1/SQLite Durable Objects, optional R2/KV, existing sensor auth/receipts/SSE/browser rooms retained. No .github workflows found. Requested PHASE11_DEPLOYMENT_REVIEW/CHECKLIST/ROLLBACK_PLAN files absent. No overnight checkpoint existed.

Historical 186 Node/29 Cloudflare results and transaction-time business authorization fixes cannot be recovered from this checkout. Historical repository checkpoint instead reports 133 Node/26 Cloudflare tests. Fresh verification is being recorded in TEST_RESULTS.md; historical numbers are not current passes.

Critical confirmed risk: business services authorize cafe/session before awaits and later mutate unconditionally within SQL batches. Existing user-management service already uses SQL-time authorization; business menu/media/stock/review services need equivalent protection. Prioritize this locally fixable blocker before adding features. Original 11D–H specifications remain authorized but unimplemented here.

Production remains NO-GO. Blockers: incomplete Phase 11; unverified remote schema/bindings/secrets/backup recovery/provider capacity/physical Android and frontend business integration. No production access required to fix local authorization. Execution order adjusted: recovery, baseline, transaction integrity/security, remaining Phase 11 as feasible, independent local operations/pilot/recovery/readiness. Do not duplicate working A–C.
