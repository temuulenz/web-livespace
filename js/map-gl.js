// Улаанбаатарын бодит газрын зураг (MapLibre GL JS + OpenStreetMap vector tile).
// Зурсан SVG газрын зурагтай ижил удирдлагын объект буцаана (js/map.js · buildMap):
// fit, centerOn, setPv, select, hover, dim, hits, refresh, destroy. Ачаалал бүтэлгүйтвэл
// onFail дуудагдаж, buildMap нь зурсан газрын зураг руу автоматаар шилжинэ.
import { $, clamp, isMobile } from './dom.js';
import { I } from './icons.js';
import { getCafes, byId } from './cafes.js';
import { Snd } from './audio.js';
import { Prefs } from './state.js';
import { MAP_BOUNDS, mapToLatLng } from './live/levels.js';
import { toast } from './components/feedback.js';
import { MAP_CONFIG } from './map-config.js';
import { mapStyle } from './map-style.js';

// Кафены байршил: серверээс lat/lng ирвэл түүнийг, үгүй бол зурсан газрын зургийн x, y-г
// одоо байгаа урвуу проекцоор хөрвүүлнэ. Демо кафенуудын цэг зохиомол (ДЕМО) хэвээр.
export function cafeLngLat(c) {
  if (Number.isFinite(c.lat) && Number.isFinite(c.lng)) return [c.lng, c.lat];
  const { lat, lng } = mapToLatLng(c.x, c.y);
  return [lng, lat];
}
export const directionsUrl = c => { const [lng, lat] = cafeLngLat(c); return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`; };

// MapLibre-г зөвхөн газрын зурагтай хуудсанд нэг удаа ачаална.
let loading = null;
export function loadMapLibre(config = MAP_CONFIG) {
  if (globalThis.maplibregl) return Promise.resolve(globalThis.maplibregl);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    Object.assign(css, { rel: 'stylesheet', href: config.maplibre.css, integrity: config.maplibre.cssIntegrity, crossOrigin: 'anonymous' });
    const js = document.createElement('script');
    Object.assign(js, { src: config.maplibre.js, integrity: config.maplibre.jsIntegrity, crossOrigin: 'anonymous', async: true });
    js.onload = () => globalThis.maplibregl ? resolve(globalThis.maplibregl) : reject(new Error('maplibre missing'));
    js.onerror = () => { js.remove(); css.remove(); reject(new Error('maplibre script failed')); };
    document.head.append(css, js);
  });
  loading.catch(() => { loading = null; });   // дараагийн оролдлогод дахин ачаална
  return loading;
}

export function buildGlMap(vp, { onSelect = null, markerHTML, cooperative = false }, { onReady, onFail }) {
  const host = document.createElement('div'); host.className = 'map-gl';
  vp.prepend(host); vp.dataset.map = 'loading';
  const events = new AbortController();
  const listen = (el, type, fn, opts = {}) => el.addEventListener(type, fn, { ...opts, signal: events.signal });
  const markers = new Map();            // id → { marker, wrap }
  let map = null, gl = null, dead = false, ready = false, pvEl = null, you = null, baseZoom = 14, ro = null;
  const animate = () => !Prefs.reduced;

  const fail = reason => {
    if (dead || ready) return;
    dead = true; clearTimeout(timer); teardown();
    onFail(reason);
  };
  const timer = setTimeout(() => fail(new Error('timeout')), MAP_CONFIG.loadTimeoutMs);

  loadMapLibre().then(lib => { if (!dead) { gl = lib; try { init(); } catch (error) { fail(error); } } }, fail);

  function init() {
    const B = MAP_BOUNDS;
    map = new gl.Map({
      container: host, style: mapStyle(), bounds: [[B.west, B.south], [B.east, B.north]],
      maxBounds: MAP_CONFIG.cityBounds, minZoom: MAP_CONFIG.minZoom, maxZoom: MAP_CONFIG.maxZoom,
      dragRotate: false, pitchWithRotate: false, touchPitch: false, attributionControl: false,
      fadeDuration: animate() ? 300 : 0, cooperativeGestures: cooperative,
      locale: { 'NavigationControl.ZoomIn': 'Томруулах', 'NavigationControl.ZoomOut': 'Жижигрүүлэх',
        'CooperativeGesturesHandler.WindowsHelpText': 'Томруулахын тулд Ctrl товч дарж гүйлгэнэ үү',
        'CooperativeGesturesHandler.MacHelpText': 'Томруулахын тулд ⌘ товч дарж гүйлгэнэ үү',
        'CooperativeGesturesHandler.MobileHelpText': 'Газрын зургийг хоёр хуруугаар хөдөлгөнө үү' }
    });
    map.touchZoomRotate.disableRotation(); map.keyboard.disableRotation();
    // «© OpenStreetMap contributors» заавал харагдана; товч, шошгонд хаагдахгүй зүүн дээд буланд.
    map.addControl(new gl.AttributionControl({ compact: true }), 'top-left');
    host._lsMap = map;                               // тест болон хөгжүүлэлтэд
    // Зурсан газрын зураг шиг дэлгэцийг дүүргэнэ (cover): ижил хэсэг, ижил томруулалт харагдана.
    const ne = map.project([B.east, B.north]), sw = map.project([B.west, B.south]);
    const cover = Math.max(host.clientWidth / Math.abs(ne.x - sw.x), host.clientHeight / Math.abs(sw.y - ne.y));
    if (Number.isFinite(cover) && cover > 0) map.jumpTo({ center: [(B.west + B.east) / 2, (B.south + B.north) / 2], zoom: map.getZoom() + Math.log2(cover) });
    // Эхний ачааллын өмнөх алдаа (CDN, tile, WebGL) → зурсан газрын зураг.
    map.on('error', e => { if (!ready) fail(e.error || new Error('map error')); });
    map.once('load', () => {
      if (dead) return;
      clearTimeout(timer); ready = true; baseZoom = map.getZoom();
      vp.dataset.map = 'gl'; onReady();
    });
    for (const c of getCafes()) addMarker(c);
    map.on('move', placePv);
    // Хоосон газар дарвал сонголтыг цуцална (чирсний дараах click-ийг MapLibre өөрөө алгасна).
    map.on('click', e => { if (e.originalEvent?.target?.closest?.('.mk,.pv,.map-ctrl,.map-legend,.map-note')) return; onSelect && onSelect(null, 'map'); });
    ro = new ResizeObserver(() => map?.resize()); ro.observe(vp);
    vp.insertAdjacentHTML('beforeend', `<div class="map-ctrl map-ctrl-gl"><button data-z="in" aria-label="Томруулах">${I.plus}</button><button data-z="out" aria-label="Жижигрүүлэх">${I.minus}</button><button data-z="me" aria-label="Миний байршил" title="Миний байршил">${I.locate}</button></div>`);
    listen($('.map-ctrl-gl', vp), 'click', e => {
      const b = e.target.closest('button'); if (!b) return; Snd.ui('click');
      const duration = animate() ? 300 : 0;
      if (b.dataset.z === 'in') map.zoomIn({ duration }); else if (b.dataset.z === 'out') map.zoomOut({ duration }); else locate();
    });
  }

  function addMarker(c) {
    const wrap = document.createElement('div');
    wrap.className = 'ml-mk'; wrap.innerHTML = markerHTML(c).trim();
    listen(wrap, 'click', e => { if (!e.target.closest('.mk')) return; e.stopPropagation(); onSelect && onSelect(c.id, 'map'); });
    const marker = new gl.Marker({ element: wrap, anchor: 'bottom' }).setLngLat(cafeLngLat(c)).addTo(map);
    markers.set(c.id, { marker, wrap });
  }
  const mk = id => markers.get(id)?.wrap.firstElementChild;
  const eachMk = fn => markers.forEach(({ wrap }, id) => fn(wrap.firstElementChild, id));

  // Урьдчилсан картыг кафены тэмдгийн хажууд байрлуулна (дэлгэцийн координатаар).
  function placePv() {
    if (!pvEl || !pvEl.isConnected || isMobile() || !map) return;
    const c = byId(pvEl.dataset.id); if (!c) return;
    const p = map.project(cafeLngLat(c)), w = vp.clientWidth, h = vp.clientHeight, pw = pvEl.offsetWidth, ph = pvEl.offsetHeight;
    let left = p.x + 34, ox = '0px';
    if (left + pw > w - 12) { left = p.x - 34 - pw; ox = '100%'; }
    left = clamp(left, 12, w - pw - 12);
    pvEl.style.left = left + 'px'; pvEl.style.top = clamp(p.y - ph / 2 - 20, 12, h - ph - 12) + 'px'; pvEl.style.setProperty('--ox', ox);
  }

  // «Миний байршил»: зөвхөн хэрэглэгч дарсны дараа асууна; байршлыг сервер рүү илгээхгүй.
  function locate() {
    if (!navigator.geolocation || !window.isSecureContext) { toast('Байршил тодорхойлоход HTTPS холболт ба хөтчийн зөвшөөрөл хэрэгтэй.'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      if (dead || !map) return;
      const ll = [pos.coords.longitude, pos.coords.latitude], [[w, s], [e, n]] = MAP_CONFIG.cityBounds;
      if (ll[0] < w || ll[0] > e || ll[1] < s || ll[1] > n) { toast('Та Улаанбаатар хотоос гадна байна.'); return; }
      placeYou(ll);
      map.easeTo({ center: ll, zoom: Math.max(map.getZoom(), 15), duration: animate() ? 600 : 0 });
    }, err => toast(err.code === 1 ? 'Байршил ашиглах зөвшөөрөл олгогдоогүй байна.' : 'Байршлыг тодорхойлж чадсангүй.'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  // «Та энд» тэмдэг (байршлыг зөвхөн хөтөч дотор ашиглана, сервер рүү илгээхгүй).
  function placeYou(ll) {
    if (!you) { const el = document.createElement('div'); el.className = 'ml-you'; el.innerHTML = '<span class="ml-you-pulse"></span><span class="ml-you-dot"></span><b>Та энд</b>'; you = new gl.Marker({ element: el, anchor: 'center' }); }
    you.setLngLat(ll).addTo(map);
  }

  function teardown() {
    events.abort(); ro?.disconnect();
    markers.forEach(({ marker }) => marker.remove()); markers.clear();
    you?.remove(); you = null;
    try { map?.remove(); } catch { /* аль хэдийн устсан */ }
    map = null; host.remove(); $('.map-ctrl-gl', vp)?.remove();
    if (vp.dataset.map !== 'svg') delete vp.dataset.map;
  }

  return {
    get ready() { return ready; },
    fit() { map?.resize(); },
    // x, y нь зурсан газрын зургийн координат (app.js кафены c.x, c.y-г дамжуулдаг).
    centerOn(x, y, zoom, instant) {
      if (!map) return;
      const { lat, lng } = mapToLatLng(x, y);
      const target = zoom ? Math.max(map.getZoom(), baseZoom + Math.log2(zoom)) : map.getZoom();
      const offset = isMobile() ? [0, -vp.clientHeight * .18] : [60, 0];
      map.easeTo({ center: [lng, lat], zoom: target, offset, duration: instant || !animate() ? 0 : 500 });
    },
    setPv(el) { pvEl = el; placePv(); },
    // Хэрэглэгчийн байршил (эсвэл хотын төв) ба ойрын кафенуудыг нэг дор багтаана.
    showNearby(ll, points, { you: showYouMark = true } = {}) {
      if (!map) return;
      if (showYouMark) placeYou(ll); else { you?.remove(); }
      const all = [ll, ...points];
      const b = all.reduce((acc, [x, y]) => [[Math.min(acc[0][0], x), Math.min(acc[0][1], y)], [Math.max(acc[1][0], x), Math.max(acc[1][1], y)]], [[ll[0], ll[1]], [ll[0], ll[1]]]);
      map.fitBounds(b, { padding: 56, maxZoom: 15.5, duration: animate() ? 600 : 0 });
    },
    select(id) { eachMk((m, mid) => m?.classList.toggle('sel', mid === id)); },
    hover(id, on) { mk(id)?.classList.toggle('hov', on); },
    dim(set) { eachMk((m, id) => m?.classList.toggle('dim', !set.has(id))); },
    hits(set) { eachMk((m, id) => m?.classList.toggle('hit', !!set && set.has(id))); },
    // Шууд хэмжилт ирвэл зөвхөн тухайн кафены тэмдгийг шинэчилнэ.
    refresh(id) {
      const entry = markers.get(id), cafe = byId(id); if (!entry || !cafe) return;
      const old = entry.wrap.firstElementChild, tmp = document.createElement('div'); tmp.innerHTML = markerHTML(cafe).trim();
      const next = tmp.firstElementChild;
      ['sel', 'hov', 'dim', 'hit'].forEach(cls => next.classList.toggle(cls, !!old?.classList.contains(cls)));
      old ? old.replaceWith(next) : entry.wrap.append(next);
      entry.marker.setLngLat(cafeLngLat(cafe));
    },
    destroy() { if (dead) return; dead = true; clearTimeout(timer); teardown(); pvEl = null; }
  };
}
