# Current local verification — 2026-11-18

All data synthetic/disposable. Raw command logs: /tmp/ls-overnight-*.log on this machine. Durable measurement artifacts accompany this report. Historical 186/29 results were not reproduced from this checkout.

| Exact command | Actual result | Evidence / scope |
|---|---|---|
| npm ci | PASS; 0 audit vulnerabilities | /tmp/ls-overnight-install.log; no dependency upgrades |
| npm test (baseline) | PASS 133; ~3.87s | baseline log, before session changes |
| npm test (final) | PASS 154; ~3.97s | final-node log, includes added race/security/restore/promotion coverage |
| node --test tests/business-write-authorization.test.mjs tests/server.test.mjs | PASS | claims log; includes concurrent one-time Node claim |
| node --test tests/promotions.test.mjs | PASS 6 | promotions log; additional null/tie assertions included |
| WRANGLER_SEND_METRICS=false node scripts/phase11-d1-check.mjs | PASS | d1 log + D1_MEASUREMENTS.json: actual D1/R2/guard/rules/rollback checks |
| BROWSER_PATH=installed Chromium WRANGLER_SEND_METRICS=false npm run test:cloudflare | PASS 27 | final-cf log; all13 additive migrations, auth/sensor/room/media/business and new readiness/promotion route checks |
| npm run test:sensors | PASS 26; ~1.85s | sensors log; overlap with full Node suite |
| BROWSER_PATH=installed Chromium npm run test:e2e | PASS 13 | final-e2e log; real Node/browser owner/admin/sensors; temporary profiles |
| WRANGLER_SEND_METRICS=false node scripts/phase72-load.mjs | PASS all12 scenarios + optional-service assertions | LOAD_MEASUREMENTS.json; temporary local D1/R2/KV/DO, not production capacity |
| WRANGLER_SEND_METRICS=false npm run cf:write-budget | PASS, 10 writes/frame | sensor-budget log; actual local metadata [7,1,2] |
| WRANGLER_SEND_METRICS=false npm run cf:check | PASS dry-run; NO deployment | final-dryrun log |
| git diff --check | PASS | no whitespace issues |

Installed BROWSER_PATH: /home/temuulen/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome. The actual commands used this full path, not a guessed command name. No original fixtures regenerated.

Resolved test failure: new Node readiness initially lacked db in route dependency destructuring, producing503; fixed, focused and full suites pass. No unresolved executed-test failures. Static-only test:browser/test:visual/test:visitor-visual not rerun this session (SKIPPED_WITH_REASON: frontend untouched; full Node fidelity tests and fresh backend browser E2E/CF run; allowance conservation). No lint/typecheck script exists; native modules parse through actual tests/Worker bundling. New CI workflow is manual-only and NOT remotely executed. Production, hardware, account quotas, full mixed future-business load, external alerting and production restore NOT verified.

Source-pattern scan:237 source/config/doc text files, zero selected key/token-pattern flags; no matching values printed and ignored credential/data/artifact paths excluded. OpenAPI/Postman parse:53 operations/54 requests. Complete session diff reviewed for backend-only scope; git diff for js/framework/styles/app.js/index.html is empty. No schema/fixture regeneration outside the new additive0013 promotion migration and schema-version expectations.
