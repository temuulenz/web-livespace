import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function startBrowser(sourceRoot = root) {
  const server = createServer(async (request, response) => {
    try {
      const path = resolve(sourceRoot, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
      if (path !== sourceRoot && !path.startsWith(sourceRoot + sep)) throw new Error('Outside site');
      const target = (await stat(path)).isDirectory() ? join(path, 'index.html') : path;
      const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
      response.setHeader('Content-Type', (mime[extname(target)] || 'application/octet-stream') + (['.html', '.css', '.js', '.svg'].includes(extname(target)) ? '; charset=utf-8' : ''));
      response.setHeader('Cache-Control', 'no-store');
      response.end(await readFile(target));
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = await mkdtemp(join(tmpdir(), 'livespace-browser-'));
  const executable = process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const browser = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-gpu', ...(process.env.BROWSER_NO_SANDBOX ? ['--no-sandbox'] : []), '--hide-scrollbars', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  browser.stderr.on('data', data => { if (process.env.DEBUG_BROWSER) process.stderr.write(data); });
  let startupError;
  browser.on('error', error => { startupError = error; });
  async function close() {
    if (browser.exitCode === null) {
      const stopped = new Promise(resolve => browser.once('exit', resolve));
      browser.kill();
      await Promise.race([stopped, delay(3000)]);
    }
    await new Promise(resolve => server.close(resolve));
    // Only this test's mkdtemp directory is removed; never use a real browser profile.
    const resolvedProfile = resolve(profile), tempRoot = resolve(tmpdir());
    if (dirname(resolvedProfile) !== tempRoot || !resolvedProfile.startsWith(join(tempRoot, 'livespace-browser-'))) throw new Error('Unexpected temporary browser profile path');
    await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  }
  try {
    let port;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (startupError) throw startupError;
      try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await delay(100); }
    }
    if (!port) throw new Error('Browser did not start. Set BROWSER_PATH to a Chromium browser.');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = targets.find(target => target.type === 'page');
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let id = 0;
    const pending = new Map(), events = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const entry = pending.get(message.id);
        if (!entry) return;
        pending.delete(message.id);
        clearTimeout(entry.timeout);
        message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result);
      } else events.push(message);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const messageId = ++id;
      const timeout = setTimeout(() => { pending.delete(messageId); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(messageId, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id: messageId, method, params }));
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    if (process.env.DEBUG_BROWSER) console.log(await send('Browser.getVersion'));
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Ulaanbaatar' });
    return { origin, send, evaluate, events, async close() { await send('Browser.close').catch(() => {}); socket.close(); await close(); } };
  } catch (error) { await close(); throw error; }
}

// Drive JS animation frames explicitly, while allowing normal DOM events and timers.
// Every capture uses the same clock, seeded randomness and CSS animation positions.
export const deterministicClock = `(() => {
  const NativeDate = Date;
  window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : ['2026-10-21T04:00:00Z'])); } static now() { return new NativeDate('2026-10-21T04:00:00Z').getTime(); } };
  let seed = 123456, time = 0, nextId = 0;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const frames = new Map();
  performance.now = () => time;
  window.requestAnimationFrame = callback => { frames.set(++nextId, callback); return nextId; };
  window.cancelAnimationFrame = id => frames.delete(id);
  window.__advance = (count = 60) => { for (let n = 0; n < count; n++) { time += 1000 / 60; const batch = [...frames]; frames.clear(); batch.forEach(([, fn]) => fn(time)); } };
  window.__pendingFrames = () => frames.size;
})();`;
