// What the browser learns from each café's published menu (GET /api/v1/cafes/:id/menu):
//  • drinkPrice(id): average drink price. Only items in drink categories count (кофе, цай,
//    ундаа…), so cakes and meals do not change it; a discounted price is used when there is one.
//  • menuPhoto(id): a real photo from the café — its featured menu item, or the first item
//    with a photo.
// Cafés without a published menu have neither (null); they sort last and use example art.
import { platform } from '../../services/platform.js';

const DRINK = /(кофе|coffee|эспрессо|espresso|латте|latte|капучино|цай|tea|ундаа|уух|шүүс|juice|лимонад|lemonade|смүүти|smoothie|какао|cocoa|шейк|shake|фраппе|frappe|drink|beverage)/i;
const TTL = 5 * 60 * 1000;
const cache = new Map();   // cafeId → { price, photo, until }

export const isDrinkCategory = name => DRINK.test(String(name || ''));

export function drinkAverage(menu) {
  const drinks = new Set((menu?.categories || []).filter(c => isDrinkCategory(c.name)).map(c => c.id));
  const prices = (menu?.products || [])
    .filter(p => drinks.has(p.category_id))
    .map(p => Number(p.discounted_price ?? p.base_price))
    .filter(n => Number.isFinite(n) && n > 0);
  return prices.length ? Math.round(prices.reduce((sum, n) => sum + n, 0) / prices.length) : null;
}

export function menuPhotoUrl(cafeId, menu) {
  const products = (menu?.products || []).filter(p => p.image_ref);
  const pick = products.find(p => p.featured) || products[0];
  return pick ? `/api/v1/cafes/${encodeURIComponent(cafeId)}/menu/products/${encodeURIComponent(pick.id)}/image` : null;
}

export const drinkPrice = id => cache.get(id)?.price ?? null;
export const menuPhoto = id => cache.get(id)?.photo ?? null;

// Loads the menus that are missing or older than five minutes, four cafés at a time.
export async function loadMenuSummaries(cafes, { signal } = {}) {
  if (!platform.online) return;
  const now = Date.now();
  const queue = cafes.filter(c => !(cache.get(c.id)?.until > now)).map(c => c.id);
  async function worker() {
    while (queue.length && !signal?.aborted) {
      const id = queue.shift();
      try {
        const menu = await platform.api.get(`/cafes/${encodeURIComponent(id)}/menu?limit=100`, { signal });
        cache.set(id, { price: drinkAverage(menu), photo: menuPhotoUrl(id, menu), until: Date.now() + TTL });
      } catch {
        if (!signal?.aborted) cache.set(id, { price: null, photo: null, until: Date.now() + 30000 });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
}
