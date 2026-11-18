# Current Phase 11 permission matrix

| Operation | Guest | Registered customer | Owner | Admin / Super Admin |
|---|---|---|---|---|
| Published menu/images, public inventory, public reviews/ratings | Active cafes only | Same | Same | Same |
| Menu CRUD, bulk/import, private image access | No | No | Actual owned cafe only | Actual owned cafe only |
| Inventory owner reads/mutations/private movements | No | No | Actual owned cafe only | Actual owned cafe only |
| Create review/report visible review | No | Registered session | Same | Same |
| Read own review/edit/delete | No | Own review only | Own review only | Own review only |
| Read owner reviews, reply/edit/delete reply, report hidden review | No | No | Actual owned cafe only | Actual owned cafe only |
| Review moderation queue/reports/audit/hide/restore | No | No | No | Admin role required |
| Rating reconciliation maintenance utility | No | No | No | Admin/operator only |
| Physical menu orphan reconciliation | No HTTP route | No HTTP route | No HTTP route | Trusted local operator utility only |
| Phase 11D–11H new APIs | Absent | Absent | Absent | Absent |

Owner/admin role alone does not bypass menu/inventory/reply cafe ownership. A cafe mismatch returns 404; missing/revoked session 401; wrong role/author/origin 403. Owners cannot delete/hide another customer's negative review. Admin moderation does not alter author identity or immutable Super Admin account restrictions. Exact quantities are public only when enabled. Reports, movement history, receipts, private media storage locations and audit actors never enter public projections. Public reviews identify a display name without account IDs/emails and are explicitly unverified. Sensitive mutations derive actors from current sessions and persist audits atomically.

Full transport, request, response, pagination, cache and realtime contracts: MENU_MANAGEMENT.md, INVENTORY_MANAGEMENT.md, RATINGS_AND_REVIEWS.md. Existing Android sensor credentials/protocol and physical hardware verification status are unchanged.
