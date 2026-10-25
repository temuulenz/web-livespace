import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const before = process.argv[2] || '.artifacts/before';
const after = process.argv[3] || '.artifacts/after';
const results = [];
for (const file of (await readdir(before)).filter(file => file.endsWith('.png'))) {
  const pngIdentical = (await readFile(join(before, file))).equals(await readFile(join(after, file)));
  const snapshot = file.replace('.png', '.json');
  const original = JSON.parse(await readFile(join(before, snapshot), 'utf8'));
  const current = JSON.parse(await readFile(join(after, snapshot), 'utf8'));
  const domIdentical = JSON.stringify(original) === JSON.stringify(current);
  results.push({ page: file.replace('.png', ''), pngIdentical, domIdentical });
}
await writeFile('.artifacts/visual-comparison.json', JSON.stringify(results, null, 2) + '\n');
assert.equal(results.length, 16, 'Expected 8 routes at 2 viewport sizes');
assert.ok(results.every(result => result.pngIdentical && result.domIdentical), 'Visual differences found: see .artifacts/visual-comparison.json');
console.log('All 16 PNG captures, DOM geometry and sampled computed styles match the original.');
