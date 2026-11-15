// Assembles the LiveSpace backend: API routes + the static website, one process.
import { createServer } from 'node:http';
import { createRouter, createStaticHandler, parseCookies, sendError, sendJson, SECURITY_HEADERS, HttpError } from './lib/http.mjs';
import { openDatabase } from './lib/db.mjs';
import { createSessions, createRateLimiter, SESSION_COOKIE, sameOrigin } from './lib/auth.mjs';
import { createRealtimeHub } from './lib/realtime.mjs';
import { createCafeService } from './services/cafes.mjs';
import { createUploads } from './services/uploads.mjs';
import { createCustomizer } from './services/visualization.mjs';
import { createSensorService } from './services/sensors.mjs';
import { createSensorGateway } from './lib/sensor-gateway.mjs';
import { seedDemoCafes, ensureAdmin } from './seed.mjs';
import * as publicRoutes from './routes/public.mjs';
import * as authRoutes from './routes/auth.mjs';
import * as partnerRoutes from './routes/partner.mjs';
import * as ownerRoutes from './routes/owner.mjs';
import * as adminRoutes from './routes/admin.mjs';
import * as ingestRoutes from './routes/ingest.mjs';

export async function createApp(config) {
  const db = openDatabase(config.dbFile);
  if (config.seedDemo) seedDemoCafes(db);
  if (config.adminEmail && config.adminPassword) await ensureAdmin(db, config.adminEmail, config.adminPassword);

  const deps = {
    db, config,
    sessions: createSessions(db, { days: config.sessionDays, secure: config.secureCookies }),
    hub: createRealtimeHub(),
    limit: createRateLimiter(),
    cafes: createCafeService(db, config),
    uploads: createUploads(config.dataDir),
    customizer: createCustomizer({ provider: config.visualizationProvider })
  };

  const api = createRouter();
  for (const routes of [publicRoutes, authRoutes, partnerRoutes, ownerRoutes, adminRoutes, ingestRoutes]) routes.register(api, deps);
  const serveStatic = createStaticHandler(config.staticDir);

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const ctx = { req, res, url, path: url.pathname, method: req.method, query: Object.fromEntries(url.searchParams), params: {}, cookies: parseCookies(req.headers.cookie) };
    ctx.ip = (config.trustProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress || '';
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
    try {
      if (ctx.path.startsWith('/api/')) {
        ctx.user = deps.sessions.user(ctx.cookies[SESSION_COOKIE]);
        if (ctx.method !== 'GET' && ctx.method !== 'HEAD' && !ctx.path.startsWith('/api/v1/ingest/')) sameOrigin(ctx);
        if (!(await api.handle(ctx))) throw new HttpError(404, 'not_found', 'Unknown API endpoint');
        return;
      }
      if (await serveStatic(ctx)) return;
      sendJson(res, 404, { error: { code: 'not_found', message: 'Not found' } });
    } catch (error) {
      if (!(error instanceof HttpError)) console.error(error);
      sendError(res, error);
    }
  }

  const server = createServer(handle);
  deps.sensors = createSensorService(deps);
  deps.sensorGateway = createSensorGateway(server, deps);
  const purge = setInterval(() => deps.sessions.purge(), 3600 * 1000); purge.unref();
  let closePromise;
  return {
    server, deps,
    listen: (port = config.port, host = config.host) => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.off('error', reject); resolve(server.address()); });
    }),
    close() {
      return closePromise ??= (async () => {
        clearInterval(purge);
        await deps.sensorGateway.close();
        deps.hub.close();
        const stopped = new Promise(resolve => server.close(resolve));
        server.closeAllConnections?.();
        await stopped;
        db.close();
      })();
    }
  };
}
