import { requireRole } from '../lib/auth.mjs';
import { sendJson, notFound } from '../lib/http.mjs';
import { createSensorHistory } from '../services/sensor-history.mjs';

export function register(router, { db, cafes, config, limit }) {
  const history = createSensorHistory(db, config);
  router.get('/api/v1/cafes/:id/sensor-history', ctx => {
    limit(`sensor-history:${ctx.ip}`, 120, 60000);
    const cafe = cafes.get(ctx.params.id);
    if (!cafe || cafe.status !== 'active' || cafe.data_mode !== 'live') throw notFound('Кафе олдсонгүй');
    sendJson(ctx.res, 200, history.read(cafe.id, ctx.query));
  });
  for (const role of ['admin', 'owner']) router.get(`/api/v1/${role}/cafes/:id/sensor-history`, ctx => {
    requireRole(...(role === 'admin' ? ['admin'] : ['owner', 'admin']))(ctx);
    const cafe = cafes.get(ctx.params.id);
    if (!cafe || (ctx.user.role !== 'admin' && cafe.owner_id !== ctx.user.id)) throw notFound('Кафе олдсонгүй');
    sendJson(ctx.res, 200, history.read(cafe.id, ctx.query, { privateView: true }));
  });
}
