// Бодит газрын зургийн загвар: зурсан SVG газрын зургийн (js/map.js · mapSVG) өнгийг хуулсан.
// Зөвхөн гудамж, цэцэрлэг, гол ус, барилга, гол замын болон дүүргийн нэр харагдана;
// POI дүрс, автобусны мэдээлэл зэрэг бусад зүйлийг нуусан.
import { MAP_CONFIG } from './map-config.js';

export const MAP_COLORS = {
  land: '#DCE6C4',        // .map-live .map-land (styles/livespace.css)
  landuse: '#E3EAD0',
  park: '#C9DBA8',
  plaza: '#F6EBDA',       // Сүхбаатарын талбай (mapSVG)
  water: '#D3DCD8',       // гол (mapSVG)
  road: '#B49E80',        // гол зам (mapSVG)
  roadMinor: '#D3C4A8',
  roadService: '#DDD1BB',
  roadDash: '#F4EFE4',    // өргөн замын тасархай шугам (mapSVG)
  building: '#EBD5B3',    // барилгын өнгө (mapSVG)
  buildingEdge: '#D9B07A',
  label: '#5E3F22',       // шошгын бичиг (mapSVG)
  halo: '#FFFFFF'         // цагаан дугуй шошго (mapSVG)
};

const C = MAP_COLORS;
const MAJOR = ['motorway', 'trunk', 'primary'];
const MID = ['secondary', 'tertiary'];
const MINOR = ['minor', 'residential', 'unclassified', 'living_street'];
const width = (z1, w1, z2, w2) => ['interpolate', ['exponential', 1.5], ['zoom'], z1, w1, z2, w2];
// OSM дээр Улаанбаатарын нэр ихэвчлэн «Кирилл ᠮᠣᠩᠭᠣᠯ» хэлбэртэй. Монгол бичгийг (U+1810–U+1878)
// хэвтээ мөрөнд зөв харуулах боломжгүй тул эхний монгол бичгийн тэмдэгтээс өмнөх кирилл хэсгийг авна.
const MONGOL_SCRIPT = Array.from({ length: 0x1878 - 0x1810 + 1 }, (_, i) => String.fromCharCode(0x1810 + i));
const cyrillicOnly = text => ['let', 'n', text,
  ['let', 'i', ['min', 9999, ...MONGOL_SCRIPT.map(ch => ['let', 'k', ['index-of', ch, ['var', 'n']], ['case', ['>=', ['var', 'k'], 0], ['var', 'k'], 9999]])],
    ['case', ['<', ['var', 'i'], 9999], ['slice', ['var', 'n'], 0, ['var', 'i']], ['var', 'n']]]];
const name = cyrillicOnly(['coalesce', ['get', 'name'], ['get', 'name_int'], '']);

export function mapStyle(config = MAP_CONFIG) {
  return {
    version: 8,
    name: 'LiveSpace',
    glyphs: config.glyphs,
    sources: { omt: { type: 'vector', url: config.tiles, attribution: config.attribution } },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': C.land } },
      { id: 'landuse', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: ['in', ['get', 'class'], ['literal', ['residential', 'commercial', 'retail', 'school', 'university', 'hospital']]], paint: { 'fill-color': C.landuse, 'fill-opacity': .7 } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': C.park } },
      { id: 'green', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['grass', 'wood', 'farmland']]], paint: { 'fill-color': C.park, 'fill-opacity': .8 } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': C.water } },
      { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', paint: { 'line-color': C.water, 'line-width': width(11, 1.5, 17, 10) } },
      { id: 'plaza', type: 'fill', source: 'omt', 'source-layer': 'transportation', filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['in', ['get', 'class'], ['literal', ['pedestrian', 'path']]]], paint: { 'fill-color': C.plaza, 'fill-outline-color': C.buildingEdge } },
      { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14.5, paint: { 'fill-color': C.building, 'fill-outline-color': C.buildingEdge, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14.5, .3, 16, .95] } },
      { id: 'road-service', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 14, filter: ['all', ['==', ['geometry-type'], 'LineString'], ['in', ['get', 'class'], ['literal', ['service', 'track']]]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.roadService, 'line-width': width(14, 1, 18, 6) } },
      { id: 'road-minor', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['all', ['==', ['geometry-type'], 'LineString'], ['in', ['get', 'class'], ['literal', MINOR]]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.roadMinor, 'line-width': width(12, .3, 18, 9) } },
      { id: 'road-mid', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['all', ['==', ['geometry-type'], 'LineString'], ['in', ['get', 'class'], ['literal', MID]]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.road, 'line-width': width(11, 1, 18, 20) } },
      { id: 'road-major', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['all', ['==', ['geometry-type'], 'LineString'], ['in', ['get', 'class'], ['literal', MAJOR]]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.road, 'line-width': width(10, 1.5, 18, 30) } },
      { id: 'road-major-dash', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 14, filter: ['all', ['==', ['geometry-type'], 'LineString'], ['in', ['get', 'class'], ['literal', MAJOR]]], paint: { 'line-color': C.roadDash, 'line-width': 1.5, 'line-dasharray': [6, 5] } },
      { id: 'label-road', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 13, filter: ['in', ['get', 'class'], ['literal', [...MAJOR, ...MID]]], layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': config.font, 'text-size': 11, 'text-max-angle': 30, 'symbol-spacing': 320 }, paint: { 'text-color': C.label, 'text-halo-color': C.halo, 'text-halo-width': 2.5 } },
      { id: 'label-park', type: 'symbol', source: 'omt', 'source-layer': 'park', minzoom: 14, layout: { 'text-field': name, 'text-font': config.font, 'text-size': 11 }, paint: { 'text-color': C.label, 'text-halo-color': C.halo, 'text-halo-width': 2.5 } },
      { id: 'label-place', type: 'symbol', source: 'omt', 'source-layer': 'place', filter: ['in', ['get', 'class'], ['literal', ['suburb', 'quarter', 'neighbourhood']]], layout: { 'text-field': name, 'text-font': config.font, 'text-size': 12, 'text-letter-spacing': .04 }, paint: { 'text-color': C.label, 'text-halo-color': C.halo, 'text-halo-width': 3 } }
    ]
  };
}
