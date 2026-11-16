# Phase 11C ratings and reviews backend

Node SQLite and Cloudflare D1 share the same service and additive Node migration 8 / D1 0012. Tables: reviews, review_replies, review_reports, review_moderation_audit, cafe_rating_summary, cafe_rating_bins. No verified visits, identity tracking, business interpretation or frontend UI is implemented.

## Criteria and aggregation semantics

Request rating keys (each integer 1–5): taste (food/coffee taste), service (service quality), comfort (environment/comfort), value (value for money), study (study/work suitability). Every creation requires all five; edits may patch individual criteria. Optional plain-text comment max 2000 characters. Overall per review is the exact arithmetic mean of the five values, generated consistently in SQL. No review count means averages are null, never zero stars.

Incremental SQL triggers update visible/nondeleted review count, five integer criterion sums and thirty distribution bins (five stars for each criterion and overall). The overall distribution rounds each review mean to the closest whole star; means advance in 0.2 increments, so ties at x.5 cannot occur. Overall cafe mean uses all criterion sums divided by 5×review_count; it does not average rounded distribution stars. Cafe criterion averages use sum/count. Hidden and author-deleted reviews are excluded. Edits, deletes, hide/restore and concurrent versioned mutations update the same summaries atomically with review state and audit. Normal summary reads never scan review history.

## Common API rules

Prefix `/api/v1/`. Existing ls_session cookie and revocation rules apply. Public requests require active cafe; owner requests require owner/admin role AND actual cafe ownership. Admin moderation uses existing admin role, including the bound Super Admin; it grants no ability to change immutable Super Admin identity. Authenticated customers may edit/delete only their own reviews. Owner/admin status alone never authorizes modifying another person's review.

JSON bodies max 16 KiB; 120 requests/IP/minute per runtime/process (not distributed abuse protection). Unknown JSON keys rejected. Mutation text is trimmed, stored as plain text; frontend must use textContent rather than innerHTML. Pagination limit 1–100 default 50, offset 0–10000 default 0. All JSON responses are no-store. Public summary cache: 128 tenants, five-second TTL, current cafe visibility check before hits, targeted post-commit invalidation on rating/moderation mutations and generation guard against in-flight stale population. Reviews themselves are not HTTP/server cached.

## Endpoint contract

Paths below are relative to /api/v1.

| Method | Path | Auth / role | Request / response |
|---|---|---|---|
| GET | /cafes/{cafe}/reviews | public active cafe | query limit,offset,sort; `{items:[public_review],pagination}` |
| GET | /cafes/{cafe}/ratings | public active cafe | summary below |
| GET | /me/cafes/{cafe}/review | current registered session | `{review:own_review_or_null}` |
| POST | /cafes/{cafe}/reviews | registered session | all five ratings, optional comment; 201 `{review:own_review}` |
| PATCH | /cafes/{cafe}/reviews/{review} | author only | `{version,taste?,service?,comfort?,value?,study?,comment?}`; `{review:own_review}` |
| DELETE | /cafes/{cafe}/reviews/{review} | author only | JSON `{version}`; `{deleted:true}` |
| POST | /cafes/{cafe}/reviews/{review}/reports | registered session, or actual owner for hidden review | `{reason}` max 500 nonempty; 201 `{id,reported:true}` |
| GET | /owner/cafes/{cafe}/reviews | actual owner, owner/admin role | limit,offset,sort; public projection plus status, includes hidden nondeleted reviews |
| GET | /owner/cafes/{cafe}/ratings | actual owner, owner/admin role | visible/nondeleted summary |
| PUT | /owner/cafes/{cafe}/reviews/{review}/reply | actual owner | `{version,text}` max 2000 nonempty; `{reply:{review_id,cafe_id,author_id,text,version,created_at,updated_at}}` |
| DELETE | same reply path | actual owner | JSON `{version}`; `{reply:null}` |
| GET | /admin/reviews/moderation | admin | limit,offset; `{items:[private_review],pagination}` for hidden or reported nondeleted reviews |
| GET | /admin/review-reports | admin | limit,offset; `{items:[report],pagination}` |
| POST | /admin/cafes/{cafe}/reviews/{review}/moderation | admin | `{version,action:"hide"|"restore",reason}` nonempty reason max 500; `{review:private_review}` |
| GET | same moderation path | admin | limit,offset; `{items:[moderation_audit],pagination}` |

Review create example:

```json
{"taste":4,"service":5,"comfort":3,"value":4,"study":5,"comment":"Optional written feedback"}
```

Unique partial index enforces one active (nondeleted) review per registered author per cafe, including hidden reviews. Editing a hidden review keeps it hidden and cannot republish it. Author deletion is soft deletion and retains the stable ID; author can later create a new review with a new ID. Deletes cannot physically remove review rows. No order or visit verification claim is made. A retried creation returns 409 review_exists rather than creating a duplicate; GET /me/cafes/{cafe}/review recovers the current record.

PATCH/DELETE/moderation require the current positive integer version; stale/concurrent writes return 409 version_conflict and roll back review, aggregate and audit together. Retrieve the current own review/owner list/admin queue before retry. Replies use version 0 for first creation and current reply version for editing/deleting. One reply exists per review; the cafe's current owner can manage that official reply, even after an ownership transfer. Deleted replies may be recreated with version 0. Negative customer reviews cannot be hidden/deleted by owners; reporting does not change visibility or rating counts.

Public review object: id,cafe_id,taste,service,comfort,value,study,overall_rating,comment,version,created_at,updated_at,author_name,verification:"unverified",reply:null or `{text,version,updated_at}`. No author account ID/email, reporter identity, report reason, private moderation reason or actor appears in the public list. Owner list additionally returns status (visible/hidden). Own/private review objects include author_id,status,moderation_reason,deleted_at and the rating fields; own endpoint returns only current author's nondeleted review. Reports contain id,review_id,cafe_id,reporter_id,reason,created_at and are admin-only. Moderation audit contains id,review_id,cafe_id,actor_id,action,reason,at; immutable database triggers prevent rewriting history. All timestamps UTC.

Sort enum: newest (created_at descending, ID tie-breaker), rating_high (overall descending, then newest), rating_low (overall ascending, then newest). Unknown sort rejected. Pagination uses one extra row to determine has_more. No N+1 reply queries; reply is a LEFT JOIN.

Summary response example for no reviews:

```json
{"cafe_id":"CAFE","review_count":0,"overall_average":null,"criterion_averages":{"taste":null,"service":null,"comfort":null,"value":null,"study":null},"rating_sums":{"taste":0,"service":0,"comfort":0,"value":0,"study":0},"distributions":{"taste":[{"stars":1,"count":0},{"stars":2,"count":0},{"stars":3,"count":0},{"stars":4,"count":0},{"stars":5,"count":0}]},"updated_at":null}
```

The example abbreviates distributions: actual response always includes taste,service,comfort,value,study,overall, each with all five star/count bins. A previously nonempty now-empty summary may have updated_at set. Count and sums are integer; means may be fractional. Distribution bins do not prove physical visits, purchases or customer segmentation.

Errors use `{error:{code,message}}`: 400 malformed JSON; 401 unauthenticated/revoked; 403 wrong role/author/origin; 404 cafe/review absent/cross-tenant/hidden public cafe; 409 review_exists/review_conflict/version_conflict; 413 body; 415 JSON content type; 422 validation_failed; 429 rate_limited; 503 storage quota/unavailable; sanitized 500 for unexpected failures. No owner moderation endpoint exists. Audit records derive actor from current session, never request user IDs.

## Reconciliation and resources

`reconcileCafeRatings(deps,cafe,admin)` in shared/business/reviews-reconcile.mjs is an explicitly invoked admin/operator utility. It checks current admin role, atomically recomputes summary and all thirty bins from visible/nondeleted reviews, and records an immutable business audit entry. It never edits/deletes reviews. This intentional maintenance scan is not run by normal requests. A bounded json_each input avoids D1's compound SELECT limit. Invalidate the service's cafe summary cache after operator repair (`reviews.invalidate(cafe)`); otherwise its conservative five-second TTL applies. No production repair was executed.

Six new tests cover integer validation/null semantics, review uniqueness, incremental sums/distributions, edit/delete/recreate, owner reply edits/deletion, reporting, moderation/audit immutability, author/tenant/role/CSRF boundaries, concurrent edits and injected post-write aggregate rollback, public privacy/pagination and repair of deliberately corrupted disposable aggregates. Local Cloudflare checks and D1 metadata probe exercise create/edit/hide/restore, owner replies/reports and authorized audit retrieval. Final measurements/results are in PHASE11_PROGRESS.md and PHASE11_BUSINESS_D1_MEASUREMENTS.json. Normal summaries use indexed cafe lookup and thirty bounded bins. Reconciliation is costlier and must be explicitly scheduled within quota. No realtime review notification is emitted yet; 11G will supply notification infrastructure. No full review scan per public summary request, trained model, physical visitor verification or production load claim.
