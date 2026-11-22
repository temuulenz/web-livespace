# Post-frontend backend recommendations

This is a proposal for later backend work. The frontend pass uses the existing Node and Cloudflare contracts.

## Phase 1 — Discovery projection

- Add a versioned public discovery endpoint that returns one featured café and a bounded page of matching cafés per category. A single response should contain the reason, stable ID, data provenance, and freshness for each result. Keep the catalogue and details contracts compatible with existing clients.
- Index published menu products and structured menu-category identifiers for coffee and dessert. A curated café-level classification could distinguish a coffee-focused café from a café that merely serves coffee. Keep unpublished, archived, and unavailable items out of claims that depend on them. Return structured reasons so the client can localize them.
- Join already-public, currently active promotions in the discovery query. Evaluate UTC start and end times and the `Asia/Ulaanbaatar` schedule server-side. Return promotion IDs, terms, the next state-change time, and an expiry appropriate to shared caches. Preserve the existing pricing and authorizations for product, variant, and category applicability.
- Combine the existing public ratings projection with discovery and details when enough reviewed data is present. Return the count alongside the average. Avoid treatment of anonymous or unverified ratings as verified visits.

## Phase 2 — Geography and public profiles

- Publish validated public café coordinates as a separate field from the illustrated map coordinates. Provide district IDs and labels, plus an opt-in bounding-box or radius filter. Use real coordinates for distance and label whether it is straight-line or based on a routing provider.
- Use user location only after explicit permission. Prefer doing distance calculations in-browser when feasible. If a server-side query is necessary, coarsen coordinates and exclude exact visitor locations from analytics and logs.
- Add an opt-in café cover image field with public, approved media and responsive derivatives. Keep partner application and private verification photos behind their existing authorization. Validate content and image size, remove metadata, and apply storage quotas and revocation.
- Provide structured opening-hours exceptions, address and directions metadata, accessibility and amenities where supplied, and a reliable public location provider. Keep optional fields absent until configured.

## Phase 3 — Time-sensitive measurements and dashboard support

- Expose independent freshness, source, and timestamp for each seating, noise, and Wi-Fi measurement. Discovery must exclude simulated and stale observations and must never infer seats from people counts. Keep durable telemetry acknowledgement, replay IDs, source separation, and the Android wire contract unchanged.
- Add batched review and menu response shapes, pagination cursors, cache revalidation with ETags, and explicit partial-result/error metadata. Evaluate indexing and write budgets on isolated D1 and SQLite instances. Keep cache keys role-aware and avoid cache pollution from private fields.
- Decide whether admin menu editing is a supported policy separate from café ownership. If adopted, implement an explicit scoped and audited permission. Avoid treating the administrator role as an implicit tenant grant. Review dashboard workflow endpoints for promotion rules, inventory, and moderation before adding frontend controls.
- Design real pre-order and arrival workflows with authenticated eligibility, idempotency, rate limiting, and clear status recovery before promoting the existing labelled demo. Evaluate whether a production phone sign-in flow is necessary independently of demo behavior.

## Rollout and security

Use additive migrations, parity tests against Node and local Cloudflare, and backwards-compatible field additions. Test authorization across guest, customer, owner, administrator and tenant boundaries. Audit media uploads, unsafe input handling, rate limits, origin/CSRF protection, and cache expiration. Run isolated performance and correctness tests for stale or malformed data before switching the homepage to the new discovery contract.
