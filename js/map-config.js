// Бодит газрын зургийн тохиргоо. Өөр tile үйлчилгээ рүү шилжихдээ зөвхөн энэ файлыг өөрчилнө
// (сервер дээрх Content-Security-Policy-д шинэ хостыг нэмэхээ мартуузай:
//  server/lib/http.mjs ба cloudflare/security.mjs).
export const MAP_CONFIG = {
  // false бол үргэлж зурсан SVG газрын зураг харуулна.
  enabled: true,
  // MapLibre GL JS 4.7.1 (BSD-3): ~803 KB JS (~210 KB gzip) + 65 KB CSS, зөвхөн газрын зурагтай
  // хуудсанд ачаална. Integrity hash нь CDN дээрх файл өөрчлөгдвөл ачаалахгүй байлгана.
  maplibre: {
    version: '4.7.1',
    js: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
    jsIntegrity: 'sha384-SYKAG6cglRMN0RVvhNeBY0r3FYKNOJtznwA0v7B5Vp9tr31xAHsZC0DqkQ/pZDmj',
    css: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
    cssIntegrity: 'sha384-MinO0mNliZ3vwppuPOUnGa+iq619pfMhLVUXfC4LHwSCvF9H+6P/KO4Q7qBOYV5V'
  },
  // OpenFreeMap: OpenStreetMap дээр суурилсан үнэгүй vector tile, API түлхүүргүй
  // (OpenMapTiles схем). TileJSON хаяг; өөр OpenMapTiles-схемтэй эх сурвалжаар сольж болно.
  tiles: 'https://tiles.openfreemap.org/planet',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  font: ['Noto Sans Bold'],            // кирилл үсэгтэй; Manrope нь газрын зургийн glyph хэлбэрээр байхгүй
  attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>',
  // Улаанбаатар хотын хүрээ: камер үүнээс гарахгүй.
  cityBounds: [[106.55, 47.78], [107.25, 48.05]],
  minZoom: 11,
  maxZoom: 18,
  // Ачаалал энэ хугацаанд дуусахгүй бол зурсан газрын зураг руу шилжинэ.
  loadTimeoutMs: 10000
};
