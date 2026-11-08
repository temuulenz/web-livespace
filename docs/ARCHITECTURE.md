# LiveSpace architecture

## Two modes, one codebase

| | Static host (e.g. the current Vercel deployment) | LiveSpace server (`npm start`) |
|---|---|---|
| Public site, map, cafés, café visualization | ✓ (bundled demo data) | ✓ (data from the server) |
| Accounts, favourites in the account | — (favourites stay in the browser, as before) | ✓ |
| Partner application with photos, owner account | form validates; nothing is sent (prototype message) | ✓ |
| Owner and admin dashboards | shows "requires the server" | ✓ |
| Live sensor data | — | ✓ |

On start, the browser asks `/api/v1/health` (2.5 s timeout). A static host answers 404, so the site keeps behaving exactly like the original demo, and every original regression test still runs in this mode.

```
browser ── index.html, app.js, js/, framework/, styles/ ───────────┐
   │  /api/v1/* (JSON, cookie session)        /api/v1/stream (SSE)  │  one Node process
   ▼                                                                 ▼
server/app.mjs ── routes/{public,auth,partner,owner,admin,ingest} ── lib/{http,db,auth,realtime}
                         │                                    services/{cafes,uploads,visualization}
                         ▼
                  data/livespace.db (SQLite, node:sqlite)   data/uploads/<application>/photo-N.jpg
```

There are no npm dependencies. The server uses Node's built-in `http`, `crypto` and `node:sqlite` (Node 22.13+; tested on 24.11). The browser uses native modules.

## Roles

| Can… | Guest | User | Café owner | Admin |
|---|:-:|:-:|:-:|:-:|
| Browse home, map, search, filter by goal, café pages, visualizations, seats/noise/Wi-Fi | ✓ | ✓ | ✓ | ✓ |
| Save favourites (♡), see them after logging in again | login window | ✓ | ✓ | ✓ |
| Submit a partnership application | ✓ | ✓ (linked to the account) | ✓ | ✓ |
| Owner dashboard `#owner`: own café's status, visualization, devices, live data, edit hours/phone/description | | | ✓ own cafés only | ✓ |
| Admin dashboard `#admin` | | | | ✓ |

The logged-in site is the same as the guest site. The only additions are an account button in the header and the pages for each role. Photographs are private: only the café's owner and admins can load them.

### Guest → favourite

1. The guest clicks ♡.
2. The login/register window opens on the same page.
3. After success, the café is saved and the window closes; the guest is still on that page.
4. Favourites are stored on the server and come back on every login.
5. Favourites saved in the browser before logging in (static demo) are merged into the account once.

### Café owner onboarding

1. The guest opens **Хамтын ажиллагаа** (Partnership) and submits the form. It keeps the original fields and adds address, hours, seats, goals, description and **3–4 photographs**, which are resized in the browser to at most 1600 px.
2. The server stores the application, the photos and a new café in status `submitted`, and returns a one-time **claim token**.
3. The **owner account** window opens straight away (e-mail pre-filled). Creating the account links it to the café. Someone who already has an account can sign in and link instead. If the window is closed, the partner page offers to finish later.
4. On `#owner` the owner sees "Таны хүсэлтийг хүлээн авлаа…" (your application has been received) and the 7-step progress. There are no live numbers until real sensors report; the dashboard explains this instead of showing invented values.

### Setup workflow (admin)

`submitted → under_review → contacting → visualization → sensors → testing → active` (or `rejected`).

- Every change is recorded with time, admin and note, and the owner sees the same timeline.
- A café appears on the public map only when it is `active`.
- Activating a real-data café requires a map position. Set `map_x`/`map_y`, or `lat`/`lng`, which are projected onto the illustrated map approximately.

## Café-specific visualization

The animated interior (`js/simulation/floor-plan.js`) is driven by **layout data** (`js/simulation/layouts.js`). There are two **templates**:

- **Минимал** (minimal): light tiled floor, dark frame, light wood, sage plants, thin lines.
- **Артистик** (artistic): terrazzo floor, green walls, terracotta and mustard furniture, velvet sofas, pendant lamps, string lights and a patterned rug.

A template sets the look and a starting arrangement. The demo cafés use both.

In the admin café view, the **layout editor** (`js/features/admin-dashboard/layout-editor.js`) shows the café exactly as visitors will see it:

- Pick a template.
- Drag any object: round tables (with their chairs), long tables, sofas, single chairs, the window bar, shelves, plants, the rug and the order counter (the barista and the order queue move with it).
- Add or delete objects, rotate chairs, tables and shelves, and mark whether a sofa has a seat sensor.
- Use the keyboard: arrow keys move the selected object (Shift for bigger steps), R rotates it and Delete removes it.

The editor warns when furniture blocks the way to a seat. The walls, windows and entrance are fixed.

A café's visualization is `{ status, layout: { preset, overrides }, notes, generator }`. `preset` is `minimal` or `artistic`, and `overrides` holds the whole arrangement. Visualizations saved with the earlier five presets are mapped to the nearest template.

**AI-ready extension point.** `server/services/visualization.mjs` defines a provider interface:

```js
{ name, async suggest({ cafe, form, photos }) → { layout: { preset, overrides }, rationale, confidence } }
```

- Today's provider is a transparent rule-based one (keywords in the description and category). The admin button "Зургаас санал авах" (suggest from photos) calls it.
- To add an AI agent, implement a provider that sends `photos[i].read()` (the image bytes) and the form to a vision model, then pass it as `config.visualizationProvider`.
- Every suggestion is sanitized (only known furniture types, inside the floor) and reviewed by an admin before it is saved. Nothing is published automatically.

## Live data

See [SENSOR_API.md](SENSOR_API.md) for the JSON format, ingestion, SSE with polling fallback, and how demo, live, test, outdated and missing data are labelled.

## Configuration (environment variables)

| Variable | Default | |
|---|---|---|
| `PORT`, `HOST` | `8080`, `127.0.0.1` | Listen address |
| `LS_DATA_DIR` | `./data` | Database and uploads (git-ignored) |
| `LS_POLL_INTERVAL_SEC` | `60` | Browser polling when the stream is down (15–3600) |
| `LS_STALE_AFTER_SEC` | `900` | Values older than this are labelled outdated |
| `LS_DEVICE_OFFLINE_SEC` | `600` | Device shown offline after this silence |
| `LS_ADMIN_EMAIL`, `LS_ADMIN_PASSWORD` | — | Create or promote the first admin at start (or use `npm run create-admin`) |
| `LS_SEED_DEMO` | `1` | Seed the 12 demo cafés into an empty database |
| `LS_MAX_PHOTO_MB` | `4` | Per-photo upload limit |
| `NODE_ENV=production` or `LS_SECURE_COOKIES=1` | | `Secure` cookies (HTTPS) |
| `LS_TRUST_PROXY=1` | | Use `X-Forwarded-For` for rate limits behind a proxy |

## Security notes

- Passwords are hashed with scrypt.
- Sessions are random 256-bit tokens in an HTTP-only, SameSite=Lax cookie, and only their hash is stored.
- Writes require JSON and a same-origin `Origin` (CSRF protection).
- Login, registration and applications are rate-limited, per IP and per device.
- Uploaded photos are checked by their file signature, not their name.
- Static serving uses an allow-list, so `server/`, `data/`, `tests/` and `.git` are never served.
- Every page gets a CSP and the usual security headers.
- Device tokens are hashed and can be rotated or revoked.

## Deployment

- **Static only (unchanged):** the existing Vercel static deployment keeps working in offline-demo mode.
- **With the backend:** run `npm start` on any Node 22.13+ host (VM, Render, Fly.io, Railway…) behind HTTPS with `NODE_ENV=production`. Persist `LS_DATA_DIR`, and serve the site and `/api` from the same origin; that is the simplest arrangement for cookies and SSE.
- **Scaling:** a single process uses SQLite in WAL mode, which is enough for a pilot. For several server instances, move storage to a server database and SSE fan-out to a shared pub/sub. Route code talks to the database only through `server/services/*` and the route modules.

## What was deliberately preserved

- **Visual identity:** palette, fonts, illustrations, SVG icons, lamp shapes and positions.
- **Animations:** lamp sway and glow (only the light is dimmer), pin pulses, hover effects, number count-ups, the floor-plan people (entering, ordering, walking, sitting, leaving), speech bubbles, coffee-machine steam, seat flashes, and reduced-motion behaviour.
- **Sound:** every UI sound and the five ambience previews (`js/audio.js` unchanged).
- **Original stylesheets:** `styles.css` and `styles/{pages,responsive,refinements}.css` are byte-identical. New CSS is in `styles/livespace.css`.
- **Existing optimizations:**
  - the cached static floor background (now rendered at the canvas's own resolution, which makes each frame cheaper);
  - one animation loop per simulation (now paused when off-screen);
  - route-scoped timers, `AbortController` cleanup, the marker index, and no per-frame allocations.
- **Engine fidelity:** the original seeded behaviour of all 10 open cafés is still verified byte-for-byte against the original layout (`legacy`, with the kitchen).

## Deliberate changes on request

- **Interior templates:** the café interior has two templates (minimal and artistic) with new colours and decoration. The original interior colours remain only in the `legacy` layout, which the fixture tests use.
- **Sockets:** socket (plug) counts are no longer shown or used anywhere, because they are not measured.
- **Open or closed:** shown as a lamp, lit yellow when open and grey when closed. The text is still available to screen readers and as a tooltip.
- **Illustrated map:** the National Park and Choijin Lama Temple drawings and labels are removed.
- **Home page:** the "open map" link is an icon.
- **Staff live page:** advice comes first, the plan fits the first screen, and temporary statuses are below.
