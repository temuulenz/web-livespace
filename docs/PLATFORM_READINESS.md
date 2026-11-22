# Platform readiness checkpoint

This branch is a partial platform readiness change. It does not implement the complete Super Admin control center or public cafe photo pipeline. Production D1 was not read or changed from this workspace because the Wrangler API token is unavailable. No production cleanup or deployment was performed.

The current `main` frontend redesign was merged into this branch. Its eight generated cafe image assets were removed; discovery cards and cafe detail covers now show an image-free state. The LiveSpace logo and drawn interface icons remain.

## Cafe identity and cleanup

Protected IDs are `I` and `cafe_9f81309be58b4d48`. The latter is the configured Sunny Day ID only when its database row has the exact name `Sunny Day coffee shop`, is active, and uses live data. The local `data/livespace.db` contains 12 demo cafes, including `I`, and no Sunny Day row. It cannot establish the production duplicate's ID or relationships.

The configured D1 binding is `DB`, database `livespace`, ID `40e181a5-4058-4f82-bdf2-e26c79392056`. An operator with authorized read-only Wrangler access should run these SELECT-only commands against the production account, with authentication supplied through their local Cloudflare login or secret environment variable (never pasted into source, tickets or chat):

```bash
npx wrangler d1 execute livespace --remote --command "SELECT c.id,c.name,c.status,c.data_mode,c.owner_id,u.email AS owner_email,c.created_at,c.updated_at FROM cafes c LEFT JOIN users u ON u.id=c.owner_id WHERE c.id IN ('I','cafe_9f81309be58b4d48') OR c.name='Sunny Day coffee shop' ORDER BY c.id"
npx wrangler d1 execute livespace --remote --command "SELECT c.id,c.name,(SELECT COUNT(*) FROM applications a WHERE a.cafe_id=c.id) applications,(SELECT COUNT(*) FROM devices d WHERE d.cafe_id=c.id) devices,(SELECT COUNT(*) FROM measurements m WHERE m.cafe_id=c.id) measurements,(SELECT COUNT(*) FROM menu_categories k WHERE k.cafe_id=c.id) menu_categories,(SELECT COUNT(*) FROM reviews r WHERE r.cafe_id=c.id) reviews FROM cafes c WHERE c.id IN ('I','cafe_9f81309be58b4d48') OR c.name='Sunny Day coffee shop' ORDER BY c.id"
npx wrangler d1 execute livespace --remote --command "SELECT key,value,updated_at FROM platform_settings WHERE key='featured_cafe_id'"
```

Compare the exact IDs and owner/application/device relationships before identifying the legitimate Sunny Day. Until then, retain both protected records, do not import the attached photos, and do not change the featured setting in production.

`node scripts/demo-cleanup.mjs --db /path/to/copy.db` is a dry run. It prints every cafe's ID, name, owner, mode, protected status and counts for every declared foreign key to `cafes`. Review the report and the production database relationships before selecting exact IDs. The script never selects an ID by cafe name. It refuses either protected ID and any owned, non-demo or related cafe. It intentionally does not delete users or cascade through activity, menus, sensors, reviews or analytics.

For a disposable local SQLite database only, deletion requires exact matching `--ids` and `--confirm` values and a new backup path:

```bash
node scripts/demo-cleanup.mjs --db /path/to/copy.db --ids A,B --confirm A,B --backup /path/to/pre-cleanup.db --execute
```

The tool creates a consistent SQLite backup before a transactional delete, rolls back on failure, runs `PRAGMA foreign_key_check`, and prints post-delete counts. To roll back a test, stop the server, retain the changed database separately, restore `pre-cleanup.db` to the original path, then run `PRAGMA integrity_check` and `PRAGMA foreign_key_check` before restarting. Do not point this local tool at production D1. Production cleanup needs a reviewed D1-specific inventory, backup/export, exact ID plan, and separate explicit approval.

## Featured cafe

Node migration 11 and D1 migration 0015 add `platform_settings`. They initialize the featured cafe only if the exact protected Sunny Day row is active and live when the migration runs. Super Admin can change or clear it through the authenticated, audited `admin/settings/featured-cafe` endpoint and the Admin settings tab. The public cafe list returns the active featured ID. The homepage renders an image-free featured section linked to the database cafe. A second cafe named Sunny Day with another ID is hidden from the public catalogue; no row is deleted.

## Current limits

- The attached real cafe photographs have not been imported. Existing partner application photos remain private and are not a public cafe gallery. A secure public cover/gallery pipeline needs implementation and review before upload.
- Super Admin can create cafes, archive unprotected cafes, and delete only empty, unowned, archived cafes that were created through the Admin API. Both protected cafe IDs are blocked from archive and deletion. The Admin UI exposes these controls. The existing Owner menu editor now opens for Super Admin on any cafe; the Node and D1 backend scope check is enforced within the mutation.
- Administrators can revoke a managed user's sessions or delete an unlinked user after recent reauthentication. Immutable Super Admin identity and linked ownership, favorites, reviews, reports and claims are protected. The Admin UI exposes these controls. This is deliberately narrower than deleting an account with historical activity.
- The Admin UI shows the existing audit endpoint and the current deployment's actual health response. Other deployment health, error rates and background job telemetry are shown as unavailable. Global settings beyond featured cafe, support mode, global analytics, photo gallery and full moderation control center are still missing.
- The local demo seed remains available in development; `NODE_ENV=production` disables it even if `LS_SEED_DEMO=1`.
- The existing Phase 11 menus, promotions, analytics, reviews and sensor routes remain in place. This branch does not claim new capabilities for them.

## Validation and merge gate

This continuation ran `npm ci`, `npm test` (204 pass), `npm run test:cloudflare` (28 pass), `npm run cf:check` (pass), `npm run test:browser` with installed Chromium (27 pass), and `npm run test:e2e` with installed Chromium (16 pass). The cleanup tool was run only in dry-run mode on the local demo database. No TypeScript or lint script exists in `package.json`.

Main merge readiness remains **NOT READY** for the full requested platform scope: production Sunny Day identity and its duplicate relationships are unverified; public cafe photo storage/upload/gallery and Owner Support Mode are incomplete; the platform-wide settings, moderation and analytics control center are incomplete. No production record should be deleted, merged or assigned a photo from this checkpoint.
