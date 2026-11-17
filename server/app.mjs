import * as phase11Routes from './routes/phase11.mjs';
import {createPhase11} from '../shared/business/phase11.mjs';
import {createRuntimeMetrics,requestCafe,protectRequest} from '../shared/business/resources.mjs';
import {transaction} from './lib/db.mjs';
import {newId} from './lib/auth.mjs';
import * as behaviorRoutes from './routes/behavior.mjs';
import {createBehaviorBackend} from './services/behavior.mjs';
import * as promotionRoutes from './routes/promotions.mjs';
import * as reviewRoutes from './routes/reviews.mjs';
import * as inventoryRoutes from './routes/inventory.mjs';
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
import * as menuRoutes from './routes/menu.mjs';
import * as publicRoutes from './routes/public.mjs';
import * as authRoutes from './routes/auth.mjs';
import * as partnerRoutes from './routes/partner.mjs';
import * as ownerRoutes from './routes/owner.mjs';
import * as adminRoutes from './routes/admin.mjs';
import * as ingestRoutes from './routes/ingest.mjs';
import * as userManagementRoutes from './routes/user-management.mjs';
import * as sensorHistoryRoutes from './routes/sensor-history.mjs';

export async function createApp(config) {
  const db = openDatabase(config.dbFile),metrics=createRuntimeMetrics();
  const prepare=db.prepare.bind(db);
  db.prepare=query=>{const stmt=prepare(query);return new Proxy(stmt,{get(target,key){const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;return (...args)=>{const start=performance.now();try{const result=value.apply(target,args);if(['get','all','run'].includes(key))metrics.db(performance.now()-start);return result;}catch(e){metrics.db(performance.now()-start,true);throw e;}};}});};
  if (config.seedDemo) seedDemoCafes(db);
  if (config.adminEmail && config.adminPassword) await ensureAdmin(db, config.adminEmail, config.adminPassword);

  const deps = {
    db, config,
    sessions: createSessions(db, { days: config.sessionDays, secure: config.secureCookies }),
    hub: createRealtimeHub({maxConnections:config.phase11.connections}),
    limit: createRateLimiter(),
    cafes: createCafeService(db, config),
    uploads: createUploads(config.dataDir),
    customizer: createCustomizer({ provider: config.visualizationProvider })
  };

  deps.behavior=createBehaviorBackend(db,config);
  const sql={first:(q,...a)=>db.prepare(q).get(...a),all:(q,...a)=>db.prepare(q).all(...a),batch:async entries=>transaction(db,()=>entries.map(([q,...a])=>db.prepare(q).run(...a)))};
  deps.phase11=createPhase11({sql,fail:(...a)=>{throw new HttpError(...a);},id:newId,options:config.phase11,metrics,runtime:()=>({sse:deps.hub.size,sensor_websockets:deps.sensorGateway?.size??null,sqlite_database_bytes:db.prepare('PRAGMA page_count').get().page_count*db.prepare('PRAGMA page_size').get().page_size})});
  for(const [key,value] of [['tenant_media_bytes',config.phase11.tenantMediaBytes],['media_upload_bytes',config.phase11.mediaBytes],['csv_rows',config.phase11.csvRows],['csv_bytes',config.phase11.csvBytes]])db.prepare('UPDATE application_limits SET value=? WHERE key=?').run(value,key);
  const api = createRouter();
  for (const routes of [phase11Routes, behaviorRoutes, promotionRoutes, reviewRoutes, inventoryRoutes, menuRoutes, publicRoutes, authRoutes, partnerRoutes, ownerRoutes, adminRoutes, ingestRoutes, sensorHistoryRoutes, userManagementRoutes]) routes.register(api, deps);
  const serveStatic = createStaticHandler(config.staticDir);

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const ctx = { req, res, url, path: url.pathname, method: req.method, query: Object.fromEntries(url.searchParams), params: {}, cookies: parseCookies(req.headers.cookie) };
    ctx.ip = (config.trustProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress || '';
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
    const requestStart=performance.now();if(ctx.path.startsWith('/api/'))res.once('finish',()=>metrics.record(requestCafe(ctx.path),res.statusCode,performance.now()-requestStart));
    try {
      if (ctx.path.startsWith('/api/')) {
        ctx.user = deps.sessions.user(ctx.cookies[SESSION_COOKIE]);
        protectRequest(ctx.path,ctx.user,ctx.ip,deps.limit,config.phase11);
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
  let running=false;
  const maintenance=setInterval(async()=>{if(running)return;running=true;try{await deps.behavior.maintenance();await deps.phase11.maintenance();metrics.job();}catch{metrics.job(true);}finally{running=false;}},30000);maintenance.unref();
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
        clearInterval(maintenance);
        while(running)await new Promise(resolve=>setTimeout(resolve,10));
        await deps.sensorGateway.close();
        deps.hub.close();
        const stopped = new Promise(resolve => server.close(resolve));
        server.closeAllConnections?.();
        await stopped;
        deps.behavior.close();
        db.close();
      })();
    }
  };
}
