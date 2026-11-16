// LiveSpace platform services: API, session, café catalogue and live updates.
//
// The site works in two modes:
//   • online  — the LiveSpace server answers /api/v1: accounts, favourites, partner
//               applications, dashboards and live sensor data are available;
//   • offline — a static host (no backend): the original demo behaves exactly as before.
import { createApiClient, createSession, createEventBus, createLiveChannel } from '../../framework/index.js';
import { getCafes, upsertCafe, retainCafes } from '../cafes.js';

const api = createApiClient({ baseUrl: '/api/v1', timeout: 10000, onUnauthorized: () => session.expire() });
const bus = createEventBus();
const session = createSession({ api, onLoginRequired: reason => bus.emit('login:required', reason) });

export const platform = {
  online: false,
  serviceUnavailable: false,
  reconnecting: false,
  api, session, bus,
  config: { poll_interval_sec: 60, stale_after_sec: 900 },
  liveStatus: 'stopped'
};

// Apply one café's live values (from the stream or polling) to the shared record.
function applyLive(update) {
  const cafe = getCafes().find(c => c.id === update.id);
  if (!cafe) return;
  upsertCafe(update);
  bus.emit('cafe:updated', cafe.id);
}

export async function loadCatalogue() {
  const { cafes } = await api.get('/cafes');
  retainCafes(new Set(cafes.map(c => c.id)));
  for (const record of cafes) upsertCafe(record);
}

let channel = null;
function startLive() {
  channel = createLiveChannel({
    streamUrl: platform.config.stream_enabled === false ? null : '/api/v1/stream',
    events: ['measurement', 'cafe', 'catalog', 'sensor.telemetry', 'sensor.status'],
    poll: async () => {
      try { return (await api.get('/live')).updates.map(u => ['measurement', u]); }
      catch (error) { if (error.code === 'database_limit_reached') markUnavailable(); throw error; }
    },
    interval: platform.config.poll_interval_sec * 1000,
    onStatus: status => { platform.liveStatus = status; bus.emit('live:status', status); },
    onMessage(type, data) {
      if (type === 'measurement') applyLive(data);
      else if (type === 'sensor.telemetry' || type === 'sensor.status') bus.emit('sensor:updated', data.locationId);
      else if (type === 'cafe') { upsertCafe(data); bus.emit('cafe:updated', data.id); }
      else if (type === 'catalog') loadCatalogue().then(() => bus.emit('catalog:changed', data)).catch(() => { });
    }
  });
  channel.start();
}

// Probe the backend quickly; a static host answers 404 and the site stays offline.
export async function initPlatform() {
  try {
    await api.get('/health', { timeout: 2500, retry: 0 });
  } catch (error) {
    session.store.set({ ready: true });
    // A 503 is an existing backend outage, not evidence of a static demo host.
    if (error.status >= 500 || error.status === 429) markUnavailable();
    return platform;
  }
  platform.online = true;
  document.documentElement.classList.add('ls-online');
  const results = await Promise.allSettled([
    api.get('/config').then(config => { platform.config = config; }),
    loadCatalogue(),
    session.load()
  ]);
  if (results.some(result => result.status === 'rejected' && (result.reason.status >= 500 || result.reason.status === 429))) { markUnavailable(); return platform; }
  platform.serviceUnavailable = false;
  bus.emit('platform:status');
  startLive();
  return platform;
}

function markUnavailable() {
  platform.online = true;
  platform.serviceUnavailable = true;
  document.documentElement.classList.add('ls-online');
  channel?.stop();
  platform.liveStatus = 'unavailable';
  bus.emit('platform:status');
}
let recovery = null;
export function retryPlatform() {
  if (recovery) return recovery;
  platform.reconnecting = true; bus.emit('platform:status'); channel?.stop();
  recovery = initPlatform().finally(() => { recovery = null; platform.reconnecting = false; bus.emit('platform:status'); });
  return recovery;
}
