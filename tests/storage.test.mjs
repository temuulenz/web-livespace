import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { store } from '../js/storage.js';
import { getCafes, byId } from '../js/cafes.js';

test('storage preserves the ls_ keys, JSON format and unavailable-storage fallback', () => {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.deepEqual(store.get('favs', []), []);
  store.set('favs', ['A', 'K']); store.set('sound', false);
  assert.equal(values.get('ls_favs'), '["A","K"]');
  assert.equal(store.get('sound', true), false);
  assert.deepEqual(store.get('favs', []), ['A', 'K']);
  values.set('ls_favs', '{invalid JSON');
  assert.deepEqual(store.get('favs', []), []);
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(store.get('sound', true), true);
  assert.doesNotThrow(() => store.set('sound', false));
});

test('cafe repository preserves record identity, order and every demo data field', async () => {
  const cafes = getCafes();
  assert.equal(cafes.length, 12);
  assert.equal(cafes.filter(cafe => cafe.open).length, 10);
  assert.equal(cafes.map(cafe => cafe.id).join(''), 'AIFOTJKBLPQH');
  assert.equal(byId('A'), cafes[0]);
  assert.equal(getCafes(), cafes);
  assert.equal(byId('missing'), undefined);
  const expected = JSON.parse(await readFile(new URL('./fixtures/cafes.json', import.meta.url), 'utf8'));
  assert.equal(createHash('sha256').update(JSON.stringify(cafes)).digest('hex'), expected.sha256);
});
