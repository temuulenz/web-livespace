# Phase 11 permission matrix — A–H

| Operation | Guest | Registered customer | Owner | Admin / Super Admin |
|---|---|---|---|---|
| Published menu/images/inventory/reviews/ratings/active promotions | Active cafes only | Same | Same | Same |
| Menu CRUD/bulk/import/private images | No | No | Actual owned cafe | Actual owned cafe |
| Private inventory/movements/mutations | No | No | Actual owned cafe | Actual owned cafe |
| Promotion list/create/versioned edit/preview | No | No | Actual owned cafe | Actual owned cafe |
| Review create / visible-review report | No | Current session | Same | Same |
| Own review read/edit/delete | No | Author only | Author only | Author only |
| Owner review view/reply/report hidden review | No | No | Actual owned cafe | Actual owned cafe |
| Moderation queue/reports/audit/hide/restore | No | No | No | Current admin |
| Validated analytics intake/session initialization | Active cafe, bounded | Same | Same | Same |
| Private cafe analytics/CSV/resources | No | No | Actual owned cafe | Any cafe |
| Platform analytics/CSV/resource monitor | No | No | No | Current admin |
| Optional-work controls / bounded maintenance | No | No | No | Current admin |
| Inbox/unread/read/preferences | No | Current recipient only | Same | Same |
| Promotion marketing delivery | No | Explicit opt-in plus current cafe favorite | Same | Same |
| Rating reconciliation utility | No | No | No | Admin/operator |
| Physical media orphan reconciliation | No HTTP endpoint | No HTTP endpoint | No HTTP endpoint | Trusted local operator utility |

Ownership equality remains mandatory for A–D owner business mutations even for administrators; analytics/monitoring intentionally permit administrator oversight. Cafe mismatch returns 404; missing/revoked session 401; wrong role/author/origin 403. Owners cannot moderate/delete another author's review. Immutable Super Admin account-management protections are unchanged. Exact stock quantities remain owner-controlled public fields.

Server resolves notification recipients; user input never names a recipient. Review submission reaches owner; reply reaches author; moderation reaches affected author/owner; real sensor incidents reach current owner/admins; resource incidents reach admins only. Insertion rechecks current enabled recipient, preference and ownership/admin eligibility. Marketing is opt-in/relevance filtered and distinct from operational categories. Cross-user inbox/read access is denied. No private notification enters public SSE.

Only aggregate behavior is exposed to owners/admins: small cohorts and keys are omitted; session/member/receipt identities are never exported. Reports, private movement/media details and audit actors stay out of public projections. Existing public review display names remain unverified and omit account IDs/emails. Provider billing and unsupported attribution remain explicitly unavailable. There is no researcher role/unrestricted research API, external sharing workflow or new credential store.
