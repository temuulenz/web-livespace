# Authentication and sensor recovery investigation

Inspected on 2026-11-16. No commit, push, deployment, production data mutation, password change or device-token rotation was performed.

## History and findings

The merge is `15a921f`, with parents `7c300aa` (Super Admin, sensor-driven visitor lifecycle and live telemetry work) and `50e6f2f` (mobile home improvements). Current HEAD `6748fd4` only formats Wrangler configuration after that merge.

| Feature | Comparison and observed failure | Recovery |
| --- | --- | --- |
| Login, registration, logout, sessions and account route | Authentication/account modules match both parents. Backend, framework and platform service match the first parent. The modal and `#account` registration were not deleted. Incoming mobile onboarding places `.tour` at z-index 95 above the header, popovers and authentication modal, intercepting physical clicks and Enter. | `js/features/home/mobile-home.js` ends the tour on account interaction, avoids starting over an open modal, and leaves authentication keyboard input alone. `styles/livespace.css` places the tour below the header and respects the account button's hidden state. |
| Authentication and live startup during an outage | Existing `initPlatform()` treated every failed health response as a static host. A real backend returning 503 therefore skipped account event binding and live-channel initialization. This is a pre-existing fallback weakness exposed by the outage, not missing routes or a Super Admin change. | `js/services/platform.js` distinguishes a server outage from static-host 404, retains account initialization, pauses known-quota live polling and reuses existing initialization on retry. `app.js`, the auth modal and the addition stylesheet show a service-unavailable message and retry action without pretending login succeeded. |
| Android sensor integration | `server/`, `cloudflare/`, framework, auth and service implementations were retained from the first parent (apart from subsequent Wrangler formatting). No removed `/ws/sensors`, token authentication, durable ACK, heartbeat, history or sensor-management implementation was found. | Existing implementations remain in place. `cloudflare/core.mjs` and `cloudflare/worker.mjs` expose a sanitized 503 for D1 quota exhaustion instead of an opaque failure. No protocol or credential changes. |
| Latest telemetry read cost | The existing latest-reading window view can scan history repeatedly during public polling. This was present before the merge. | `server/lib/sensor-latest.mjs` shares an indexed history lookup between `server/services/sensor-state.mjs` and `cloudflare/views.mjs`. It uses the existing `measurements_sensor_latest` index, preserves replay/source/reassignment/revocation semantics, and adds no latest-state store or migration. This reduces one read amplifier; it does not guarantee the whole application fits a provider quota. |

No wholesale file reverts were used. Super Admin checks, original visitor rendering/movement/population controller, live noise, editor/layouts, custom domain configuration, security headers and sensor ingestion/commit ordering were not replaced.

## Production observations (read-only)

Both `livecafe.space` and the existing workers.dev health endpoint returned HTTP 503 with `database: unavailable_or_unmigrated`. A read-only remote D1 query was rejected with Cloudflare code 7500: the account exceeded the D1 Free daily row-read limit. D1 metadata reported 15 existing tables, about 1.37 MB, and 6,393,828 rows read over 24 hours. An unavailable health response is therefore not evidence of deleted accounts or sensor code. The config endpoint still responds through the custom domain.

The publicly served `app.js`, after line-ending normalization, matches the older `fd3c12b` version, rather than either merge result or current HEAD. Source fixes have not been deployed. Production remains subject to the provider quota until it resets or the operator changes capacity; this work does not claim to restore a quota-blocked production connection.

CSP remains `script-src 'self'`. Tests deliberately trigger a blocked external analytics script and then physically click through authentication successfully. The analytics warning is separate from these failures.

## Regression coverage

`tests/support/login-clicks.mjs` uses CDP mouse input and hit testing, rather than DOM `.click()`, for desktop/mobile account, login, registration and logout actions. It covers first-visit onboarding, an already open modal, strict CSP, unavailable backend feedback and recovery without reload. `tests/login-navigation.mjs` runs these on disposable Node/SQLite instances; `tests/cloudflare.mjs` runs them against disposable Workers/D1/Durable Objects.

The optional `LOGIN_BASELINE` test archives only public assets into a temporary directory. Physical auth checks passed against parent `7c300aa`; parent `50e6f2f` reproduced the mobile failure (`#accBtn blocked by DIV.tour in`). This identifies the incoming tour as the interaction regression without discarding its other improvements.

New Node tests cover sanitized quota errors and indexed latest readings versus the original view, including delayed replay, real/simulated separation, reassigned and revoked devices. Existing suites verify immutable-ID Super Admin restrictions, recent authentication, session revocation, authenticated WebSockets, durable ACK/persistence, idempotent replay, heartbeat, live browser people/noise updates, stale/offline handling, history, layouts and animation fidelity.

All test credentials, users, sensor tokens, databases and browser profiles are disposable. Browser verification uses Chromium; Firefox and a physical Android device were not exercised. Production authenticated WebSockets could not be validated while production D1 was quota-blocked.

Final results:

| Command | Result |
| --- | --- |
| `npm ci` | Passed |
| `npm test` | 92 passed |
| `npm run test:sensors` | 26 passed |
| `npm run test:login` | 5 physical-interaction/outage checks passed |
| `npm run test:browser` | 16 passed |
| `npm run test:e2e` | 14 passed |
| `npm run test:visitor-visual` | 11 original lifecycle/pixel comparisons passed |
| `npm run test:visual` | 16 desktop/mobile screenshots captured; 16 checks passed |
| `npm run test:cloudflare` | 21 passed against local Workers/D1/Durable Objects |
| `git diff --check` | Passed |

One final Cloudflare attempt failed to launch Chromium before browser assertions; rerunning with browser startup diagnostics completed all 21 checks. No original fidelity fixtures were regenerated.
