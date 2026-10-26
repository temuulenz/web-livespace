// Run only against the original monolith before refactoring. The fixture is committed.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { runScenario, simulationEnvironment } from './support/simulation.mjs';

if (!process.argv[2]) throw new Error('Pass the path to the original, pre-refactor app.js to capture its behavior.');
const source = await readFile(process.argv[2], 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const floorPlan = section('const ZONES =', '/* ---------- about ---------- */');
const data = section('const SS =', '/* ================= state');
const rng = section('function rng(', 'const ROADS =');
const environment = simulationEnvironment();
const context = vm.createContext({ ...environment.globals, Prefs: { reduced: false }, isMobile: () => false, Snd: { ui() {} }, AbortController });
vm.runInContext(`const clamp = (v,a,b) => Math.max(a,Math.min(b,v));\n${rng}\n${data}\n${floorPlan}\nglobalThis.FloorPlan = FloorPlan; globalThis.cafes = CAFES;`, context);
const fixtures = {};
for (const cafe of context.cafes.filter(cafe => cafe.open)) {
  const result = runScenario(context.FloorPlan, cafe, environment);
  fixtures[cafe.id] = {
    scenarioHash: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
    initialDrawHash: createHash('sha256').update(result.initialDraw).digest('hex'),
    states: result.states.map(({ label, stats, people }) => ({ label, free: stats.free, total: stats.total, unknown: stats.unknown, people: people.length })),
    events: result.events.length,
    statsEmitted: result.stats.length
  };
}
await mkdir('tests/fixtures', { recursive: true });
await writeFile('tests/fixtures/simulation.json', JSON.stringify(fixtures, null, 2) + '\n');
console.log('Captured original simulation behavior for all 10 open cafes.');
