// Disposable, loopback-only fixture for the client walkthrough.
import {randomUUID} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
import {loadConfig} from '../server/config.mjs';
import {runSimulator, simulatorOptions} from './sensor-simulator.mjs';

const dir = await mkdtemp(join(tmpdir(), 'livespace-client-demo-'));
const controller = new AbortController();
const stop = () => controller.abort();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
let app;
try {
  const adminEmail = 'demo-admin@example.invalid', adminPassword = randomUUID();
  const email = 'demo-owner@example.invalid', password = randomUUID();
  const port = Number(process.env.DEMO_PORT ?? 8080);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('DEMO_PORT must be a valid port');
  app = await createApp(loadConfig({LS_DATA_DIR: dir}, {adminEmail, adminPassword}));
  const address = await app.listen(port, '127.0.0.1');
  const base = `http://127.0.0.1:${address.port}`;
  async function post(path, data, cookie) {
    const response = await fetch(base + '/api/v1' + path, {
      method: 'POST', headers: {Origin: base, 'Content-Type': 'application/json', ...(cookie ? {Cookie: cookie} : {})},
      body: JSON.stringify(data)
    });
    if (!response.ok) throw Error(`Demo setup failed at ${path} (HTTP ${response.status})`);
    return {data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0]};
  }
  const {data: {user}} = await post('/auth/register', {email, password});
  const {db} = app.deps;
  db.prepare("UPDATE users SET role='owner' WHERE id=?").run(user.id);
  db.prepare("UPDATE cafes SET name='LiveSpace Demo Cafe', owner_id=?, data_mode='live', hours='00:00–23:59', description='Synthetic venue and sensor data for demonstration.' WHERE id='A'").run(user.id);
  db.prepare("UPDATE cafes SET name='LiveSpace Demo Cafe (no sensor)', data_mode='live', hours='00:00–23:59' WHERE id='B'").run();
  const {cookie: ownerCookie} = await post('/auth/login', {email, password});
  const category = await post('/owner/cafes/A/menu/categories', {name: 'Demo Coffee', published: true}, ownerCookie);
  await post('/owner/cafes/A/menu/products', {category_id: category.data.item.id, name: 'Demo Latte', base_price: 8500, published: true}, ownerCookie);
  const {cookie} = await post('/auth/login', {email: adminEmail, password: adminPassword});
  const {data: {token}} = await post('/admin/devices', {id: 'CLIENT-DEMO-SIM', cafe_id: 'A', kind: 'simulator'}, cookie);
  const options = simulatorOptions(['--url', base.replace('http:', 'ws:') + '/ws/sensors', '--device', 'CLIENT-DEMO-SIM', '--location', 'A', '--interval', '5000', '--people', '8'], {LS_SENSOR_TOKEN: token});
  console.log(`Demo URL: ${base}/#explore\nVenue: ${base}/#cafe-A\nNo sensor: ${base}/#cafe-B\nOwner dashboard: ${base}/#owner\nLocal synthetic owner: ${email}\nLocal synthetic password: ${password}`);
  if (process.argv.includes('--no-sensor')) {
    if (!controller.signal.aborted) await new Promise(resolve => controller.signal.addEventListener('abort', resolve, {once: true}));
  } else {
    await runSimulator(options, {signal: controller.signal, log: () => {}});
  }
} catch (error) {
  if (!controller.signal.aborted) throw error;
} finally {
  await app?.close();
  await rm(dir, {recursive: true, force: true});
}
