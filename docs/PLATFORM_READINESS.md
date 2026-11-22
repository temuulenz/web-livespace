# Platform readiness checkpoint

This branch is a partial platform readiness change. It does not implement the complete Super Admin control center or public cafe photo pipeline. Production D1 was not read or changed from this workspace because the Wrangler API token is unavailable.

## Cafe identity and cleanup

Protected IDs are `I` and `cafe_9f81309be58b4d48`. The latter is the configured Sunny Day ID only when its database row has the exact name `Sunny Day coffee shop`, is active, and uses live data. The local `data/livespace.db` contains 12 demo cafes, including `I`, and no Sunny Day row. It cannot establish the production duplicate's ID or relationships.

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
- Cafe creation/deletion, safe user deletion, session revocation UI, global settings beyond featured cafe, support mode, global analytics and operations dashboard are not added here.
- The local demo seed remains available in development; `NODE_ENV=production` disables it even if `LS_SEED_DEMO=1`.
- The existing Phase 11 menus, promotions, analytics, reviews and sensor routes remain in place. This branch does not claim new capabilities for them.
