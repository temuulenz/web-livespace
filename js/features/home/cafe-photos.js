// Кафены зураг (нүүр хуудсанд).
//
// Нийтийн API (`GET /api/v1/cafes`) одоогоор кафены зураг буцаадаггүй (docs/BACKEND_REQUESTS.md, 5-р хэсэг).
// Тиймээс:
//   1. API `photos: [{ url, alt? }]` буцаавал түүнийг шууд ашиглана;
//   2. үгүй бол кафены өөрөө өгсөн зургийг энд, дизайн файлынх нь id-аар (js/simulation/designs/)
//      бүртгэнэ. Кафе таних нь дизайн файлтай ижил: id эсвэл нэрээр.
// Зураггүй кафе онцлох хэсэгт орохгүй; картан дээр зурсан lofi дүрслэл гарна.
import { designFor } from '../../simulation/designs/index.js';

const asset = name => new URL('photos/' + name, import.meta.url).href;
const set = (id, alts) => alts.map((alt, i) => ({ src: asset(`${id}-${i + 1}.webp`), small: asset(`${id}-${i + 1}-s.webp`), alt }));

const BUNDLED = {
  'sunny-day': set('sunny-day', [
    'Sunny Day Coffee — урд танхим: лангуу, амттаны витрин, урт ширээнүүд',
    'Sunny Day Coffee — цонхны баар, гурван өндөр сандал',
    'Sunny Day Coffee — арын танхим, ном зурсан хана',
    'Sunny Day Coffee — арын танхимын ширээнүүд'
  ])
};

// Зөвхөн https:// эсвэл өөрийн сайтын (/…) хаяг; бусад (javascript:, data: г.м.) хаягийг хаяна.
const safeUrl = url => typeof url === 'string' && /^(https:\/\/|\/(?!\/))/.test(url);
const fromApi = c => (Array.isArray(c.photos) ? c.photos : [])
  .map(p => typeof p === 'string' ? { url: p } : p || {})
  .map(p => ({ src: p.url || p.src, small: p.small, alt: typeof p.alt === 'string' ? p.alt : c.name || '' }))
  .filter(p => safeUrl(p.src))
  .map(p => ({ ...p, small: safeUrl(p.small) ? p.small : p.src }));

export function photosOf(cafe) {
  if (!cafe) return [];
  const api = fromApi(cafe);
  if (api.length) return api;
  const design = designFor(cafe);
  return design && Object.hasOwn(BUNDLED, design.id) ? BUNDLED[design.id] : [];
}
