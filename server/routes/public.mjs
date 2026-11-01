// Public, read-only endpoints used by every visitor (no login).
import { sendJson, notFound } from '../lib/http.mjs';

export const API_VERSION = '1';

// The compact live payload pushed over SSE and returned by the polling endpoint.
export const liveUpdate = cafe => ({ id: cafe.id, open: cafe.open, opens: cafe.opens, status_text: cafe.status_text ?? null, occ: cafe.occ, sound: cafe.sound, wifi: cafe.wifi, mbps: cafe.mbps, live: cafe.live });

export function register(router, { config, cafes, hub }) {
  router.get('/api/v1/health', ctx => sendJson(ctx.res, 200, { ok: true, api: API_VERSION, time: new Date().toISOString() }));

  router.get('/api/v1/config', ctx => sendJson(ctx.res, 200, {
    poll_interval_sec: config.pollIntervalSec,
    stale_after_sec: config.staleAfterSec
  }));

  router.get('/api/v1/cafes', ctx => sendJson(ctx.res, 200, { cafes: cafes.listPublic(), server_time: new Date().toISOString() }));

  router.get('/api/v1/cafes/:id', ctx => {
    const cafe = cafes.getPublic(ctx.params.id);
    if (!cafe) throw notFound('Кафе олдсонгүй');
    sendJson(ctx.res, 200, { cafe });
  });

  // Polling fallback: the same per-café payload the stream pushes, for every non-demo café.
  router.get('/api/v1/live', ctx => sendJson(ctx.res, 200, {
    updates: cafes.listPublic().filter(c => c.live.mode !== 'demo').map(liveUpdate),
    server_time: new Date().toISOString()
  }));

  router.get('/api/v1/stream', ctx => hub.subscribe(ctx.req, ctx.res));
}
