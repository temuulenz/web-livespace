import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categories, matchesDiscovery, recommendationEntries, pinFeatured, publishedMenuGroups, activePromotion, ratingText } from '../js/features/home/recommendations.js';

const now = Date.parse('2026-11-21T11:00:00Z');
const fresh = { mode: 'live', updated_at: new Date(now - 1000).toISOString(), free_pct: 42 };
const cafe = { id: 'one', name: 'Sample', district: 'District', address: 'Coffee street', tags: ['Ажиллах'], open: true, live: fresh };
const category = key => categories.find(c => c.key === key);
const evidence = () => ({ menu: new Map(), promotions: new Map() });

test('search covers catalogue metadata and district, without approximate distance', () => {
  assert.equal(matchesDiscovery(cafe, ' coffee ', 'District'), true);
  assert.equal(matchesDiscovery(cafe, 'coffee', 'Other'), false);
  assert.equal(matchesDiscovery(cafe, 'latte', ''), false);
  assert.equal(matchesDiscovery({ name: 'Minimal' }, 'minimal', ''), true);
});

test('each recommendation needs its own public evidence', () => {
  const ev = evidence();
  assert.equal(recommendationEntries([cafe], category('work'), ev).length, 1);
  assert.equal(recommendationEntries([cafe], category('dessert'), ev).length, 0);
  ev.menu.set(cafe.id, publishedMenuGroups({
    categories: [{ id: 'unused', name: 'Кофе' }, { id: 'used', name: 'Амттан' }], products: [{ category_id: 'used' }]
  }));
  assert.equal(recommendationEntries([cafe], category('dessert'), ev).length, 1);
  assert.equal(recommendationEntries([cafe], category('coffee'), ev).length, 0);
  const item = { state: 'active', starts_at: new Date(now - 60000).toISOString(), ends_at: new Date(now + 1000).toISOString(), title: 'Offer' };
  ev.promotions.set(cafe.id, { item: activePromotion({ items: [item] }, now), until: now + 500 });
  assert.equal(recommendationEntries([cafe], category('promo'), ev, { now })[0].reason, 'Offer');
  assert.equal(recommendationEntries([cafe], category('promo'), ev, { now: now + 500 }).length, 0);
  assert.equal(activePromotion({ items: [{ ...item, state: 'draft' }] }, now), null);
});

test('seat category excludes absent, zero, stale, simulated, future and people-only measurements', () => {
  const liveCases = [
    undefined, { mode: 'demo' }, { ...fresh, mode: 'test' }, { ...fresh, stale: true },
    { ...fresh, free_pct: 0 }, { ...fresh, free_pct: 110 }, { ...fresh, free_pct: undefined },
    { ...fresh, updated_at: new Date(now + 1000).toISOString() }, { ...fresh, sensor: { status: 'online', observedPeople: 2 } },
    { ...fresh, updated_at: new Date(now - 61000).toISOString() }
  ];
  const rows = recommendationEntries([cafe, ...liveCases.map((live, n) => ({ ...cafe, id: `bad-${n}`, live }))], category('seats'), evidence(), { now, staleAfterSec: 60 });
  assert.deepEqual(rows.map(r => r.cafe.id), ['one']);
});

test('rating belongs to the displayed café and comes from actual reviews', () => {
  const review = { cafe_id: 'one', review_count: 2, overall_average: 4.75 };
  assert.equal(ratingText(review, 'one'), '4.8');
  assert.equal(ratingText(review, 'two'), '');
  assert.equal(ratingText({ ...review, review_count: 0 }, 'one'), '');
  assert.equal(ratingText({ ...review, overall_average: 7 }, 'one'), '');
});

test('the featured café takes the first "Онцлох кафе" place only in lists it qualifies for', () => {
  const others = ['I', 'F', 'T'].map(id => ({ ...cafe, id, name: id }));
  const sunny = { ...cafe, id: 'sunny', name: 'Sunny Day coffee shop' };
  const near = recommendationEntries([...others, sunny], category('near'), evidence(), { now, featuredId: 'sunny' });
  assert.deepEqual(near.map(entry => entry.cafe.id), ['sunny', 'I', 'F', 'T'], 'the others keep their order');
  assert.deepEqual(recommendationEntries(others, category('near'), evidence(), { now, featuredId: 'sunny' }).map(e => e.cafe.id), ['I', 'F', 'T']);
  assert.equal(recommendationEntries([...others, sunny], category('dessert'), evidence(), { now, featuredId: 'sunny' }).length, 0, 'no list without evidence');
  assert.deepEqual(recommendationEntries([...others, sunny], category('near'), evidence(), { now }).map(e => e.cafe.id), ['I', 'F', 'T', 'sunny'], 'no setting, no change');
  const list = [{ cafe: { id: 'a' } }, { cafe: { id: 'b' } }];
  assert.equal(pinFeatured(list, 'a'), list); assert.equal(pinFeatured(list, null), list);
});
