// Admin «Кафены мэдээлэл»: the café's location is picked on the real map instead of typing
// latitude/longitude. Click the map or drag the pin; the form's existing lat, lng, map_x and
// map_y fields are filled in (same form, same API). If the map cannot load, the number
// fields stay available under «Координатаа гараар засах».
import { loadMapLibre } from '../../map-gl.js';
import { mapStyle } from '../../map-style.js';
import { MAP_CONFIG } from '../../map-config.js';
import { MAP_BOUNDS, projectToMap, mapToLatLng } from '../../live/levels.js';
import { clamp } from '../../dom.js';
import { Snd } from '../../audio.js';

const num = v => v === '' || v == null ? NaN : Number(v);

export function mountLocationPicker(host, form) {
  const field = name => form.elements[name];
  const read = host.parentElement.querySelector('[data-loc-read]');
  const manual = host.parentElement.querySelector('.loc-manual');
  let map = null, marker = null, dead = false;

  // Where the pin starts: saved lat/lng, else the drawn map position, else the city centre.
  const start = () => {
    const lat = num(field('lat').value), lng = num(field('lng').value);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lng, lat];
    const x = num(field('map_x').value), y = num(field('map_y').value);
    if (Number.isFinite(x) && Number.isFinite(y)) { const p = mapToLatLng(x, y); return [p.lng, p.lat]; }
    return [(MAP_BOUNDS.west + MAP_BOUNDS.east) / 2, (MAP_BOUNDS.south + MAP_BOUNDS.north) / 2];
  };
  const show = ([lng, lat]) => { read.textContent = `Сонгосон байршил: ${lat.toFixed(5)}, ${lng.toFixed(5)}`; };
  // Fill the form fields; the drawn map position follows the same point.
  const put = ([lng, lat]) => {
    field('lat').value = lat.toFixed(6); field('lng').value = lng.toFixed(6);
    const { x, y } = projectToMap(lat, lng);
    field('map_x').value = clamp(x, 0, 1000); field('map_y').value = clamp(y, 0, 680);
    show([lng, lat]);
  };

  loadMapLibre().then(gl => {
    if (dead) return;
    const at = start();
    map = new gl.Map({ container: host, style: mapStyle(), center: at, zoom: 15, maxBounds: MAP_CONFIG.cityBounds, minZoom: MAP_CONFIG.minZoom, maxZoom: MAP_CONFIG.maxZoom, dragRotate: false, pitchWithRotate: false, touchPitch: false, attributionControl: false });
    map.addControl(new gl.AttributionControl({ compact: true }), 'top-left');
    map.addControl(new gl.NavigationControl({ showCompass: false }), 'top-right');
    marker = new gl.Marker({ draggable: true, color: '#7B542F' }).setLngLat(at).addTo(map);
    host._lsMap = map; host._lsMarker = marker;
    marker.on('dragend', () => { const p = marker.getLngLat(); put([p.lng, p.lat]); Snd.ui('pop'); });
    map.on('click', e => { marker.setLngLat(e.lngLat); put([e.lngLat.lng, e.lngLat.lat]); Snd.ui('pop'); });
    show(at);
    host.dataset.ready = '1';
  }).catch(() => {
    if (dead) return;
    host.hidden = true; manual.open = true;
    read.textContent = 'Газрын зураг ачаалагдсангүй. Координатаа доор гараар оруулна уу.';
  });

  // Typing in the manual fields moves the pin too.
  const onInput = e => {
    if (!marker || !['lat', 'lng'].includes(e.target.name)) return;
    const lat = num(field('lat').value), lng = num(field('lng').value);
    if (Number.isFinite(lat) && Number.isFinite(lng)) { marker.setLngLat([lng, lat]); map.easeTo({ center: [lng, lat], duration: 0 }); show([lng, lat]); }
  };
  form.addEventListener('input', onInput);
  return () => { dead = true; form.removeEventListener('input', onInput); map?.remove(); };
}
