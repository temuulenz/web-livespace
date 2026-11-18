# First cafe client demonstration

**Local demo GO.** Startup, browser integration, owner access, simulated telemetry, and the missing/stale states passed local checks. Physical sensor installation and production deployment remain outside this checkpoint.

## Start on the presenter’s computer

```bash
cd ~/Documents/web/web-livespace
npm ci
node scripts/client-demo.mjs
```

Use Node 22.13 or newer. The command creates a fresh temporary SQLite database and starts on loopback at port 8080. Keep the terminal open. It prints the demo URLs and a new synthetic owner password. Enter that password off screen.

## Walkthrough

1. Open `http://127.0.0.1:8080/#explore`. Introduce the seeded venues as demonstration data and select **LiveSpace Demo Cafe**. The direct link is `/#cafe-A`. The illustrated map works when external tiles are unreachable.
2. Show the venue details and scroll to **Цэс**. The on-page menu is the existing browser mock, labeled **ДЕМО**. To show the separate persisted backend menu, open `/api/v1/cafes/A/menu` and point out **Demo Latte**.
3. On the venue page, show the **SIMULATED** badge, eight observed people, and the uncalibrated dBFS reading. This is a simulator on the real backend, with unavailable seat counts shown as a dash. Open `/#cafe-B` to show the venue without a sensor.
4. Use the account button to log in with the terminal’s synthetic owner credentials. Open `/#owner` to show the venue and telemetry. The mock menu editor remains browser-local.

## Recovery

- Stop with Ctrl+C and repeat the start command to recreate the fixture. Restarting generates a new password. Use a private browser window to clear old sessions and mock edits.
- If port 8080 is occupied, run `DEMO_PORT=8081 node scripts/client-demo.mjs` and open the printed URLs.
- If telemetry is unavailable, restart with `node scripts/client-demo.mjs --no-sensor` and show the live-data empty state. Discovery, details, menus and the owner dashboard remain available. For a fully static fallback, run `python3 -m http.server 8000 --bind 127.0.0.1` and open `http://127.0.0.1:8000/#explore`. Static mode has no backend owner access or live ingestion.
- Normal shutdown removes the temporary fixture. A hard interruption can leave a `livespace-client-demo-*` directory under the system temp directory. Restart always creates a fresh fixture.

## Verification

The real demo launcher passed Chromium and HTTP smoke checks for readiness, public venue detail and menu, owner login/dashboard, simulated occupancy/noise, and the missing sensor state. The full browser E2E suite passed 13 checks, including stale/offline and the visible demo menu. Node passed 185 tests, including SQLite v1 migration and local DB/media restore. Focused sensors passed 26. Local Cloudflare passed 28 checks on the preceding bundle. The final bundle passed Wrangler dry-run and the focused Cloudflare item analytics, scope, deduplication, flush, JSON and CSV check.
