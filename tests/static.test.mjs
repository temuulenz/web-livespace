import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve('.');
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(directory, entry.name)) : join(directory, entry.name)))).flat();
}

test('HTML assets and the complete native module graph resolve on a static host', async () => {
  const html = await readFile('index.html', 'utf8');
  assert.match(html, /<script type="module" src="app\.js\?v=3"><\/script>/);
  for (const [, url] of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
    if (/^https?:/.test(url)) continue;
    await access(join(root, url.split('?')[0]));
  }
  for (const file of ['app.js', ...await files('js')]) {
    const source = await readFile(file, 'utf8');
    for (const [, url] of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(url.startsWith('.'), `Unexpected runtime dependency: ${url}`);
      await access(resolve(dirname(file), url));
    }
  }
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(Object.keys(manifest.dependencies || {}).length, 0);
  assert.equal(Object.keys(manifest.devDependencies || {}).length, 0);
});

test('ordered CSS preserves every original token except the confirmed duplicate rule', async () => {
  const expected = JSON.parse(await readFile('tests/fixtures/styles.json', 'utf8'));
  const ordered = ['styles.css', 'styles/pages.css', 'styles/responsive.css', 'styles/refinements.css'];
  const html = await readFile('index.html', 'utf8');
  let previous = -1;
  for (const file of ordered) {
    const position = html.indexOf(`href="${file}?`);
    assert.ok(position > previous, `Stylesheet out of order: ${file}`);
    previous = position;
  }
  const css = (await Promise.all(ordered.map(file => readFile(file, 'utf8')))).join('');
  const normalized = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '');
  assert.equal(createHash('sha256').update(normalized).digest('hex'), expected.deduplicatedSha256);
});
