/* ================= data ================= */
const SS = [null,
  { k: 1, t: 'Номын сан шиг нам гүм', s: 'Хуудас эргүүлэх чимээ л сонсогдоно', short: 'Нам гүм' },
  { k: 2, t: 'Цай буцлах чимээ шиг намуухан', s: 'Аяга халбаганы чимээ, шивнэх яриа', short: 'Намуухан' },
  { k: 3, t: 'Айлын зочны өрөө шиг яриа хөөрөөтэй', s: 'Яриа тод сонсогдоно, дулаахан уур амьсгал', short: 'Яриатай' },
  { k: 4, t: 'Үдийн цайны газар шиг шуугиантай', s: 'Олон хүний яриа давхцана, төвлөрөхөд хэцүү', short: 'Шуугиантай' },
  { k: 5, t: 'Сургуулийн завсарлага шиг чимээтэй', s: 'Хашгираан, инээд, гүйлдээн — ярихдаа хоолойгоо өндөрсгөнө', short: 'Чанга' }];
const WIFI = ['Хэмжилт алга', 'Сул', 'Дундаж', 'Сайн', 'Маш сайн'];
const WIFI_S = ['Мэдээлэл ороогүй', 'Мессеж, имэйлд л хангалттай', 'Вэб үзэх, хичээл уншихад', 'Видео дуудлага хийхэд болно', 'Том файл, видео дуудлага хоёул'];
const CAFES = [
  { id: 'A', x: 470, y: 250, dist: '480 м', walk: 6, hours: '08:00–22:00', open: true, tags: ['Сурах', 'Ажиллах'], occ: 36, sound: 2, wifi: 4, mbps: 64, note: 'Цонхны гэрэлтэй, чимээгүй булантай' },
  { id: 'I', x: 612, y: 248, dist: '260 м', walk: 3, hours: '08:00–21:00', open: true, tags: ['Сурах', 'Ажиллах'], occ: 55, sound: 3, wifi: 3, mbps: 58, note: 'Урт ширээтэй, багаар ажиллахад тохиромжтой' },
  { id: 'F', x: 545, y: 128, dist: '560 м', walk: 7, hours: '08:00–20:00', open: true, tags: ['Найзуудтай'], occ: 86, sound: 4, wifi: 2, mbps: 45, note: 'Оюутнуудын дуртай, үргэлж хөл хөдөлгөөнтэй' },
  { id: 'O', x: 640, y: 470, dist: '470 м', walk: 6, hours: '09:00–23:00', open: false, opens: 'Маргааш 09:00', tags: ['Сурах', 'Ажиллах'], occ: 0, sound: 0, wifi: 0, mbps: null, note: '' },
  { id: 'T', x: 810, y: 440, dist: '700 м', walk: 9, hours: '09:00–22:00', open: true, tags: ['Сурах'], occ: 45, sound: 3, wifi: 3, mbps: 47, note: 'Номын тавиуртай, тухтай буйдантай' },
  { id: 'J', x: 330, y: 470, dist: '820 м', walk: 10, hours: '08:00–22:00', open: true, tags: ['Найзуудтай'], occ: 70, sound: 4, wifi: 2, mbps: 32, note: 'Том цонхтой, хөгжимтэй' },
  { id: 'K', x: 855, y: 228, dist: '1.1 км', walk: 14, hours: '07:30–21:00', open: true, tags: ['Сурах', 'Ажиллах'], occ: 30, sound: 1, wifi: 4, mbps: 71, note: 'Чимээгүй бүстэй, ажиллахад тохиромжтой' },
  { id: 'B', x: 230, y: 575, dist: '1.4 км', walk: 17, hours: '10:00–00:00', open: true, tags: ['Найзуудтай'], occ: 92, sound: 5, wifi: 1, mbps: null, note: 'Орой амьд хөгжимтэй арга хэмжээ болдог' },
  { id: 'L', x: 160, y: 420, dist: '1.6 км', walk: 19, hours: '10:00–20:00', open: true, tags: ['Сурах', 'Тухтай'], occ: 22, sound: 1, wifi: 3, mbps: 35, note: 'Хамгийн нам гүм — номын сангийн уур амьсгал' },
  { id: 'P', x: 385, y: 330, dist: '2.8 км', walk: 32, hours: '11:00–22:00', open: true, tags: ['Найзуудтай', 'Тухтай'], occ: 60, sound: 3, wifi: 0, mbps: null, note: 'Дээврийн тагттай, оройн гэрэлтүүлэг гоё' },
  { id: 'Q', x: 915, y: 575, dist: '910 м', walk: 11, hours: '12:00–20:00', open: false, opens: 'Өнөөдөр 12:00', tags: ['Найзуудтай', 'Сурах'], occ: 0, sound: 0, wifi: 0, mbps: null, note: '' },
  { id: 'H', x: 705, y: 610, dist: '1.2 км', walk: 15, hours: '08:00–22:00', open: true, tags: ['Тухтай', 'Ажиллах'], occ: 15, sound: 2, wifi: 3, mbps: 51, note: 'Цэцэрлэгт хүрээлэнгийн хажууд, тайван' }
].map(c => ({ ...c, name: 'Кафе ' + c.id }));
const cafeIndex = new Map(CAFES.map(cafe => [cafe.id, cafe]));
const byId = id => cafeIndex.get(id);

// Shared demo records keep existing in-memory updates visible to every view.
// When the backend is available, js/services/cafe-repository.js merges server
// records into these same objects, so every view keeps its references.
const getCafes = () => CAFES;
const TOTAL_SEATS = 20;

// Merge a server record into the shared list; existing cafés keep their identity.
function upsertCafe(record) {
  const existing = cafeIndex.get(record.id);
  if (existing) return Object.assign(existing, record);
  const cafe = { ...record };
  CAFES.push(cafe); cafeIndex.set(cafe.id, cafe);
  return cafe;
}
// Drop cafés the server no longer lists (e.g. paused by an admin).
function retainCafes(ids) {
  for (let i = CAFES.length - 1; i >= 0; i--) if (!ids.has(CAFES[i].id)) { cafeIndex.delete(CAFES[i].id); CAFES.splice(i, 1); }
}

export { SS, WIFI, WIFI_S, TOTAL_SEATS, getCafes, byId, upsertCafe, retainCafes };
