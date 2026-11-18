# Phase 11 local security and validation checkpoint

2026-11-17: A–H backend implementation and local validation complete against PHASE11_ACCEPTANCE.md. No deployment, production CPU/account capacity or hardware-validation claim.

Promotion service reuses existing sessions and tenant policy (actual cafe ownership, including admins). Write batches recheck enabled actor ownership, persist audit and mutation atomically, and reject version races. Unknown fields, noninteger discounts, invalid dates, malformed local recurrence, conflicting targets and foreign menu references are rejected. Composite FKs defend target boundaries, and an insert trigger enforces the 100-rule quota under concurrent writes. Public responses exclude actors/private diagnostics and expose only published currently active rules at active cafes. No arbitrary SQL, URL uploads, raw HTML rendering or external messaging added. Rule names are text for frontend rendering. Body/rate/page/quota bounds are enforced server-side. IP rate windows remain process/isolate-local.

An existing body-limit regression was fixed: Node now pauses excess body input, sends sanitized JSON 413 and closes the connection, preserving bounded buffering. HTTP regression covers this behavior alongside session, origin and validation boundaries. Category removal now returns documented category_in_use if retained promotions reference it.

Recorded commands use disposable data; browser path /home/temuulen/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome, BROWSER_NO_SANDBOX=1 for this environment. Set WRANGLER_SEND_METRICS=false for local Cloudflare commands.

- npm ci: passed, zero audit vulnerabilities. Dependency postinstall scripts were blocked by npm policy; available Wrangler binaries still worked.
- npm test: 177 passed, zero failed (final rerun recorded in progress).
- npm run test:sensors: 26 passed, zero failed.
- node --test tests/promotions.test.mjs: 9 passed, zero failed.
- npm run test:browser: 17 checks passed; automatic real-map check reported unreachable external tiles/library and verified fallback. No assertions changed.
- npm run test:e2e: 13 passed, zero failed.
- npm run test:cloudflare: 29 passed, including new promotion APIs/pricing and additive migrations.
- node scripts/phase11-d1-check.mjs: passed, local D1/R2 races/rollback/recovery; exact metadata in PHASE11_EH_D1_MEASUREMENTS.json.
- node scripts/phase11-menu-demo.mjs: passed, ephemeral simulated fixture only.
- node scripts/phase11-menu-budget.mjs: cold menu 6 statements, warm 2; not billing measurements.
- npm run cf:check: passed, dry-run only.
- git diff --check: passed.

Visitor checks passed, visual suite passed 17 checks (same external-map skip notice), and new-module syntax checks passed. Final closeout is in PHASE11_PROGRESS.md. No package scripts for lint, static type checking or production frontend build exist. Native JS has no frontend build; Wrangler dry-run validates Worker bundling. All 12 cafe/browser load cases and 36 nested synthetic session variants passed; PHASE11_LOAD_MEASUREMENTS.json records exact local results and fixture overrides. Production/account headroom remains unverified. No physical Android, live production, provider account or 24-hour capacity validation performed.


E–H security coverage includes strict v2 payload/reference validation, server timestamps and cafe-scoped pseudonyms; durable retry/ambiguous flush and Node collector restart recovery; session/tenant budget rollback and the shared v1/v2 local-day boundary; complete omission of suppressed cohort keys/counts from reports/CSV; current owner/admin/recipient authorization; marketing opt-in/favorite relevance; concurrent inbox budget/dedup admission and ownership changes during delivery; sensor incident deduplication and source separation; media reservation order/default cap compatibility; platform/cafe namespace separation and tenant/severity-specific resource alerts. The three additive shared schemas match D1 migrations verbatim, and the frozen pre-Android fixture upgrades to schema 12.

The static browser harness now waits for the async map's twelve markers after resize while retaining its exact count assertion. Final browser/visual checks passed; external real-map reachability still receives the suite's built-in unavailable notice. Forty-two changed/new native modules passed syntax checks and machine JSON/whitespace checks passed. No frontend/style/fixture/dependency modification, test assertion weakening, paid external delivery or production/Git mutation occurred. Detailed commands/counts/limitations: PHASE11_REPORT.md and final PHASE11_PROGRESS.md closeout.
