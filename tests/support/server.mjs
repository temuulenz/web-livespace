// Starts a real LiveSpace server on a random port with a throw-away database.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../server/config.mjs';
import { createApp } from '../../server/app.mjs';

export const ADMIN = { email: 'admin@livespace.test', password: 'admin-password-123' };

export async function startServer(overrides = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'livespace-test-'));
  const config = loadConfig({ LS_DATA_DIR: dataDir, LS_ADMIN_EMAIL: ADMIN.email, LS_ADMIN_PASSWORD: ADMIN.password }, { port: 0, ...overrides });
  const app = await createApp(config);
  const { port } = await app.listen(0, '127.0.0.1');
  const origin = `http://127.0.0.1:${port}`;
  return {
    origin, app, config,
    // A tiny cookie-keeping client per simulated browser.
    client() {
      let cookie = '';
      const call = async (method, path, body, headers = {}) => {
        const response = await fetch(origin + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
        const set = response.headers.get('set-cookie');
        if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
        const text = await response.text();
        let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        return { status: response.status, data, headers: response.headers };
      };
      return { get: (p, h) => call('GET', p, undefined, h), post: (p, b = {}, h) => call('POST', p, b, h), put: (p, b = {}) => call('PUT', p, b), patch: (p, b = {}) => call('PATCH', p, b), del: p => call('DELETE', p), get cookie() { return cookie; } };
    },
    async stop() { await app.close(); await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  };
}

// Smallest bytes that pass the JPEG signature check.
export const tinyJpeg = (n = 0) => 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(64 + n, 7)]).toString('base64');
