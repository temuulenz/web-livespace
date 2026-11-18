# Phase 11 frontend integration guide

Updated by the deployment readiness review, 2026-11-17. Backend APIs A–H exist locally; production remains NO-GO pending [deployment gates](PHASE11_DEPLOYMENT_REVIEW.md). No teammate frontend component, adapter, stylesheet or fixture was modified by this review.

## Current compatibility boundary

The existing platform session/live-sensor service uses real APIs when available. **js/services/customer-adapter.js still exports a mock adapter** using localStorage. Its demonstration phone OTP, going/visit and menu flows do not become authenticated server features merely because Phase 11 exists. There is no server phone-OTP, verified-visit, order, payment, revenue, researcher or unrestricted raw analytics API. Keep unsupported flows clearly demo-labelled until a separately authorized integration supplies documented behavior. Do not map an email/password session to an invented phone credential.

Use the native framework and createApiClient conventions; no frontend dependency/build step is needed. Feature contracts are authoritative for exact fields: [menu](MENU_MANAGEMENT.md), [inventory](INVENTORY_MANAGEMENT.md), [reviews](RATINGS_AND_REVIEWS.md), [promotions](PROMOTIONS.md), [analytics](BEHAVIOR_ANALYTICS.md), [notifications](NOTIFICATIONS.md), [resources](RESOURCE_CONTROLS.md). Machine handoff: [OpenAPI](openapi.yaml), [Postman](PHASE11.postman_collection.json), [API index](PHASE11_API_CONTRACT.md), [permission matrix](PHASE11_PERMISSION_MATRIX.md). There are 71 operations across 54 paths; the collection has 72 requests including login. Counts are not a substitute for payload/role validation.

## Shared HTTP and security behavior

Base `/api/v1`. Authenticate using existing `/auth/login` JSON email/password and same-origin cookies. Use credentials on requests; never put session/device tokens in URLs or localStorage. Current ownership/role/recipient is checked server-side; a cafe ID in browser state grants no authority. Keep login/logout/session-expiry behavior from the existing framework.

Private requests use no-store. Writes send Content-Type: application/json with exact whitelisted body fields and current version where required. Prices/quantities are integers; flags in stored menu/inventory entities often return 0/1 while input requires JSON booleans. Timestamps persist UTC. Report date inputs and promotion recurrence use Asia/Ulaanbaatar, not browser-local timezone guesses. Never assume a null/omitted metric means zero.

The isolated demonstration command now exercises menu, stock and a clearly simulated review/rating in an ephemeral cafe marked data_mode=demo; no real customer feedback or production records are inserted. All local fixture users/files/database are removed on completion. Research aggregate export endpoints remain a future 11F task. Public review/rating responses are operational summaries, not business conclusions.

11D additions: PROMOTION_ENGINE.md documents owner configuration/preview, public active retrieval, informational-only types, UTC envelopes and Asia/Ulaanbaatar recurrence. Current listed menu price comes from DB; preview requests never include client prices. Overlapping rules do not stack. Handle 409 access_changed by reloading/re-authenticating; transaction-time session/ownership changes no longer commit stale writes. GET /api/v1/ready is for operators, not a replacement for discovery data or evidence of production readiness. No UI/event handlers changed.
