import { createBrowserRooms } from '../../framework/api/browser-realtime.js';
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
  channel?.stop();
  const fallback = createLiveChannel({
    streamUrl: platform.config.stream_enabled === false ? null : '/api/v1/stream',
    events: ['measurement', 'cafe', 'catalog', 'sensor.telemetry', 'sensor.status'],
    poll: async () => (await api.get('/live')).updates.map(u => ['measurement', u]),
    interval: platform.config.poll_interval_sec * 1000,
    onStatus: status => { showInterruption(status==='unavailable'); platform.liveStatus = status; bus.emit('live:status', status); },
    onMessage(type, data) {
      if (type === 'measurement') applyLive(data);
      else if (type === 'sensor.telemetry' || type === 'sensor.status') bus.emit('sensor:updated', data.locationId);
      else if (type === 'cafe') { upsertCafe(data); bus.emit('cafe:updated', data.id); }
      else if (type === 'catalog') loadCatalogue().then(() => bus.emit('catalog:changed', data)).catch(() => { });
    }
  });
  channel=platform.config.browser_realtime ? createBrowserRooms({cafeIds:getCafes().filter(c=>c.live&&c.live.mode!=='demo').map(c=>c.id),fallback,onSnapshot:applyLive,onStatus:status=>{platform.liveStatus=status;bus.emit('live:status',status);}}) : fallback;
  channel.start();
}

function showInterruption(show) {
  let banner=document.getElementById('ls-service-interruption');
  if(show && !banner){banner=document.createElement('p');banner.id='ls-service-interruption';banner.setAttribute('role','alert');banner.textContent='Үйлчилгээ түр тасалдсан. Дараа дахин оролдоно уу. / Temporary service interruption. Please try again later.';document.body.prepend(banner);}
  if(!show)banner?.remove();
}

// Probe the backend quickly; a static host answers 404 and the site stays offline.
export async function initPlatform() {
  try {
    await api.get('/health', { timeout: 2500, retry: 0 });
  } catch (error) {
    if(error.status===503){platform.online=true;showInterruption(true);document.documentElement.classList.add('ls-online');retainCafes(new Set());}
    session.store.set({ ready: true });
    return platform;
  }
  platform.online = true;
  document.documentElement.classList.add('ls-online');
  await Promise.allSettled([
    api.get('/config').then(config => { platform.config = config; }),
    loadCatalogue().catch(error=>{if(error.status===503){retainCafes(new Set());showInterruption(true);}throw error;}),
    session.load()
  ]);
  startLive();
  return platform;
}
