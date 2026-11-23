import { I } from '../../icons.js';
import { dataModeOf, trustState } from '../../live/status.js';

const dessertIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l12-7 6 5v8H3zM3 13h18M3 16h18"/><circle cx="15" cy="4" r="2"/></svg>';

export const categories = [
  { key: 'near', label: 'Танд ойрхон', icon: I.pin, title: 'Танд тохирох <em>кафенууд</em>', text: 'Байршил болон өөрт хэрэгтэй нөхцлөөр кафенуудаа хайж, очих газраа сонгоорой.' },
  { key: 'dessert', label: 'Амттан', icon: dessertIcon, title: 'Гоё <em>амттантай</em> кафенууд', text: 'Нийтэлсэн цэсэндээ амттантай кафенуудыг сонирхоорой.', source: 'menu', menu: 'амттан' },
  { key: 'work', label: 'Ажиллах', icon: I.laptop, title: '<em>Ажиллахад</em> тохиромжтой', text: 'Ажиллах зориулалтаар бүртгэсэн кафенуудаас сонгоорой.' },
  { key: 'promo', label: 'Хямдрал', icon: I.tag || I.star, title: 'Кафены <em>урамшуулал</em>', text: 'Яг одоо нийтэд нээлттэй урамшуулалтай кафенуудыг үзээрэй.', source: 'promotions' },
  { key: 'coffee', label: 'Кофе', icon: I.cup, title: '<em>Кофетой</em> кафенууд', text: 'Кофены сонголтоо нийтэлсэн цэснээс хараарай.', source: 'menu', menu: 'кофе' },
  { key: 'seats', label: 'Сул суудал', icon: I.seat, title: '<em>Сул суудалтай</em> кафенууд', text: 'Суудлын шинэ хэмжилттэй, нээлттэй кафенуудыг олоорой.' }
];

const demoReasons = {
  dessert: { T: 'Чизкейк, жимсний тарт', L: 'Лимонтой тарт, макарон', J: 'Тирамису, шоколадтай брауни', H: 'Зөгийн балтай бялуу', F: 'Гүзээлзгэнэтэй бялуу' },
  coffee: { I: 'Флэт уайт, латте', K: 'Фильтер кофе, эспрессо', A: 'Капучино, американо', P: 'Хүйтэн кофе, ванильтай латте', L: 'Мокка, кортадо' },
  promo: { J: 'Кофе, амттаны багц 15% хямд', F: 'Хоёр дахь латте 20% хямд', B: 'Оюутанд 10% хямдралтай', P: 'Өдрийн багц 12% хямд', T: 'Өглөөний кофе 10% хямд' }
};

const normalize = value => String(value ?? '').trim().toLowerCase();
export function matchesDiscovery(cafe, query, district) {
  if (district && cafe.district !== district) return false;
  const needle = normalize(query);
  return !needle || [cafe.name, cafe.district, cafe.address, cafe.category, cafe.description, ...(cafe.tags || [])]
    .some(value => normalize(value).includes(needle));
}

export function publishedMenuGroups(data) {
  const used = new Set((data?.products || []).map(p => p.category_id));
  return new Set((data?.categories || []).filter(c => used.has(c.id)).map(c => normalize(c.name)));
}

export function activePromotion(data, now = Date.now()) {
  return (data?.items || []).find(item => item.state === 'active' &&
    Date.parse(item.starts_at) <= now && now < Date.parse(item.ends_at)) || null;
}

export function ratingText(data, id) {
  const rating = data?.overall_average;
  return data?.cafe_id === id && data.review_count > 0 && Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating.toFixed(1) : '';
}

function freshFreePct(cafe, now, staleAfterSec) {
  const live = cafe.live;
  const age = now - Date.parse(live?.updated_at);
  if (!cafe.open || !Number.isFinite(age) || age < 0 || age > staleAfterSec * 1000 ||
    trustState(cafe, { now, staleAfterSec }).kind !== 'live' || live.sensor) return null;
  return Number.isFinite(live.free_pct) && live.free_pct > 0 && live.free_pct <= 100 ? live.free_pct : null;
}

// The featured café (platform setting) takes the first, "Онцлох кафе" place of any list it
// qualifies for; the others keep their order. It is never added to a list it does not qualify for.
export function pinFeatured(entries, featuredId) {
  const index = featuredId ? entries.findIndex(entry => entry.cafe.id === featuredId) : -1;
  return index > 0 ? [entries[index], ...entries.slice(0, index), ...entries.slice(index + 1)] : entries;
}

export function recommendationEntries(cafes, category, evidence, { now = Date.now(), staleAfterSec = 900, demo = false, featuredId = null } = {}) {
  return pinFeatured(recommendationList(cafes, category, evidence, { now, staleAfterSec, demo }), featuredId);
}

function recommendationList(cafes, category, evidence, { now, staleAfterSec, demo }) {
  return cafes.flatMap(cafe => {
    const entry = { cafe, reason: cafe.description || cafe.note || cafe.district || '', score: Number(Boolean(cafe.open)) };
    if (demo && isDemoCafe(cafe)) {
      const sample = demoReasons[category.key]?.[cafe.id];
      if (sample) return [{ ...entry, reason: `Жишээ · ${sample}` }];
    }
    switch (category.key) {
      case 'work':
        if (!cafe.tags?.includes('Ажиллах')) return [];
        entry.reason = 'Ажиллах зориулалтаар тэмдэглэсэн кафе.';
        break;
      case 'dessert':
      case 'coffee':
        if (!evidence.menu.get(cafe.id)?.has(category.menu)) return [];
        entry.reason = category.key === 'dessert' ? 'Нийтэлсэн цэсэнд амттаны сонголттой.' : 'Нийтэлсэн цэсэнд кофены сонголттой.';
        break;
      case 'promo': {
        const promotion = evidence.promotions.get(cafe.id);
        if (!promotion || promotion.until <= now || Date.parse(promotion.item.ends_at) <= now) return [];
        entry.reason = promotion.item.title || 'Идэвхтэй урамшуулалтай.';
        break;
      }
      case 'seats': {
        const sample = demo && isDemoCafe(cafe);
        const free = sample && cafe.open && Number.isFinite(cafe.occ) && cafe.occ >= 0 && cafe.occ < 100
          ? 100 - cafe.occ : freshFreePct(cafe, now, staleAfterSec);
        if (free == null) return [];
        entry.score = free;
        entry.reason = sample ? `Жишээ · ${Math.round(free)}% сул суудалтай.` : `Сүүлийн хэмжилтээр ${Math.round(free)}% сул суудалтай.`;
        break;
      }
      case 'near':
        // Public map coordinates are illustrative. A chosen district scopes the
        // list upstream; sample walking times never become proximity rankings.
        break;
    }
    return [entry];
  }).sort((a, b) => b.score - a.score);
}

export const isDemoCafe = cafe => dataModeOf(cafe) === 'demo';
