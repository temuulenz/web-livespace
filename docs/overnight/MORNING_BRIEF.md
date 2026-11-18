# Rollback recovery brief

Reapplied the previous tested checkpoint on **main**, recovered from local f81abe9 without a branch switch, cherry-pick or commit. Preserved newer cafe-owner assignment and map CSP changes. The newer ownership assignment service also now rejects logout/revocation at commit, preserving owner_changed compatibility.

Fresh passes:176 Node tests,28 local Cloudflare checks,26 sensors,13 E2E,12 load scenarios plus optional-service/cold-restart checks, direct D1 probe and Wrangler dry-run. Sensor cost remains10 writes/frame. No unresolved executed failures; no frontend/Android or production changes. Static-only visuals, hardware and remote CI not reverified.

Restored A–D promotions/security/readiness/restore work and all handoff documents. **11E–H and full readiness remain incomplete; pilot/production remain NO-GO.** Next implementation:11E existing analytics extension. Continuation: ../OVERNIGHT_PROGRESS.md; evidence: TEST_RESULTS.md. No deployment/push authorized.
