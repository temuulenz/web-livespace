# LiveSpace — approved Phase 11E–11H acceptance specification

Approved by the user on 2026-11-17. The original detailed policies are unavailable. Use PHASE11_PROGRESS.md and existing continuation notes as the baseline; this specification resolves the previous requirements blocker. Preserve completed A–D without restarting them. Backend/technical work only; no teammate frontend redesign, business research workflows, external sharing, paid services, deployment, production changes or Git mutations.

## 11E — User behavior analytics

Events: cafe viewed; cafe searched; search filter applied; menu viewed; menu item viewed; favorite added/removed where supported; promotion viewed/clicked; directions requested; review submitted.

Support authenticated and anonymous visitors with pseudonymous session identifiers. Validate types and payload schemas, record server timestamps, prevent duplicate events, configure ingestion rate limits, reject arbitrary/oversized metadata, aggregate by cafe/type/time with daily/weekly/monthly statistics. Retention/aggregation policies must be configurable and ingestion must not significantly degrade normal APIs. Do not store precise location, raw IP addresses, fingerprints or unnecessary personal data. Never expose individual behavior to owners.

Owners access aggregates only for their cafes; administrators access platform aggregates; public users cannot access private analytics. No researcher role/unrestricted research API. Any exports contain only aggregated, de-identified data with small-cohort suppression. No business research workflows or external sharing.

Acceptance: correct valid-event aggregation; invalid-event rejection; authorization/tenant isolation; configurable retention/aggregation; bounded ingestion overhead.

## 11F — Cafe owner analytics

Metrics where actual data supports them: profile views; unique pseudonymous sessions; menu views; popular menu items; promotion impressions/clicks/CTR; favorite counts; review count/average; historical occupancy/peak hours/noise/Wi-Fi; sensor availability; applicable inventory availability statistics.

Date-range filtering, daily/weekly/monthly aggregation and previous equivalent-period comparisons are required. Reuse sensors/analytics. Distinguish real, simulated, unavailable and insufficient data. Return null/explicit unavailable where unsupported, never invented values. Owners only their cafes; administrators may access platform aggregates. Bound queries, pagination, caches and indexes; safe aggregate CSV export. No revenue/sales/conversion metrics without actual corresponding transactions.

Acceptance: metrics match source; accurate filters/comparisons; owner isolation; empty datasets handled; large requests bounded; simulation labeled; frontend API contracts documented.

## 11G — Persistent event-driven notifications

Required triggers/recipients:

1. Review submitted → reviewed cafe owner.
2. Owner review response → authenticated review author.
3. Low inventory/out-of-stock → owner, only threshold crossing/state transition.
4. Promotion published → eligible authenticated users explicitly opted into relevant marketing notifications.
5. Promotion approaching expiration → owner, default 24-hour reminder.
6. Sensor offline → affected owner and authorized administrators, existing heartbeat/offline policy.
7. Sensor recovered → affected owner and authorized administrators.
8. Resource warning/critical → authorized administrators.
9. Administrative moderation → affected owner/content author, as applicable.

Required channels/features: persistent in-app notifications; unread count; individual/all read; category preferences. Marketing must be opt-in and distinguishable from operations. Recipient authorization, deduplication, configurable cooldowns and one-incident storm prevention. No arbitrary client recipient selection/private leakage. Reuse domain events/transactional outbox. Optional realtime via existing transport; email only if a configured provider already exists, with retry/delivery status. No paid SMS/push/external services.

Acceptance: only authorized recipients; duplicates suppressed; preferences respected; cross-user access denied; no sensor storms; history survives restart.

## 11H — Application resource monitoring and controls

Available metrics: API counts/latency/error rates/rate violations; DB operations/latency; storage/media usage; analytics ingestion; notification queue/failed deliveries; active SSE/WS; sensor ingestion/connectivity; background failures; runtime health.

Configurable protection: API requests per user/tenant/anonymous client; analytics events/session/tenant; media size/storage; CSV size/row count; pagination; analytics ranges; notification generation; concurrent connections; background batch size; sensor ingestion frequency. Reuse existing controls.

Default measurable-quota thresholds: warning 70%, critical 90%, hard 100% where safe. Make thresholds configurable. Reject/defer only affected nonessential work with documented errors, preserve data, never auto-delete content or indiscriminately disable essential sensors/security.

Preserve Cloudflare compatibility with no new paid/production resources. No assumed billing API access; unavailable provider metrics must be explicitly unavailable. Distinguish application measurements from billing. Avoid unnecessary DB work; bound aggregation/retention. Admin platform metrics; owner own usage/quotas; public minimal health only.

Acceptance: accurate available measurements; server-side controls; deduplicated administrator threshold transitions; graceful exhaustion; tenant privacy; Node/Cloudflare parity; bounded overhead.

## Cross-cutting execution and definition of done

Reuse services, repositories, validators, sessions/RBAC and architecture; preserve compatibility. Add safe additive migrations and unit/integration/security/regression tests. Run discovered Node, sensor, local Cloudflare, browser/E2E and build validations without weakening/skipping tests. Document conservative configurable defaults where unspecified.

Read progress, verify A–D and resolve failures; implement E, then F, G and H. Update progress/report, API/frontend handoff and resource configuration documentation. Continue independent work if an external dependency blocks part. Phase 11 is complete only when A–H satisfy acceptance and required validation. No unsupported completion, trained-model, physical-hardware or provider-capacity claims.
