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

Full transport, request, response, pagination, cache and realtime contracts: MENU_MANAGEMENT.md, INVENTORY_MANAGEMENT.md, RATINGS_AND_REVIEWS.md. Existing Android sensor credentials/protocol and physical hardware verification status are unchanged.

11D promotion ownership matches menus: owner/admin AND actual current cafe ownership, including at COMMIT. Public list contains active published rules only, with currently visible associated menu IDs. Preview/configuration/draft details are owner-only. Administrative role alone cannot edit another owner's promotions. Readiness endpoint is public, generic and does not expose credentials/binding names. Sensitive existing Node/CF legacy owner/admin writes and A–D business mutations now revalidate database identity/session in their atomic write boundary.
