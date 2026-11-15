import WebSocket from 'ws';
import { startHeartbeat } from './lib/ws-heartbeat.mjs';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { SENSOR_ID } from '../server/lib/telemetry-schema.mjs';

export function simulatorOptions(args = process.argv.slice(2), env = process.env) {
  const defaults = { url: 'ws://127.0.0.1:8080/ws/sensors', device: '', location: '', token: env.LS_SENSOR_TOKEN || '',
    interval: '15000', people: '8', noise: '-37.1', battery: '85', mode: 'auto', count: '0',
    'heartbeat-ms': '30000', 'disconnect-every': '0', 'duplicate-every': '0', 'invalid-every': '0', 'reconnect-ms': '1000' };
  const { values } = parseArgs({ args, options: { ...Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, { type: 'string', default: value }])), help: { type: 'boolean', default: false } } });
  if (values.help) return values;
  const url = new URL(values.url);
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('URL must be ws:// or wss:// without credentials, query, or fragment');
  if (!SENSOR_ID.test(values.device) || !SENSOR_ID.test(values.location)) throw new Error('--device and --location must be valid IDs');
  if (!/^lsd_[A-Za-z0-9_-]{1,128}$/.test(values.token)) throw new Error('Set LS_SENSOR_TOKEN or --token to the registered device token');
  if (!['auto', 'manual'].includes(values.mode)) throw new Error('--mode must be auto or manual');
  for (const [key, min, max, integer] of [
    ['heartbeat-ms', 1, 60000, true], ['interval', 1, 86400000, true], ['people', 0, 10000, true], ['noise', -160, 0], ['battery', 0, 100], ['count', 0, 1000000, true],
    ['disconnect-every', 0, 1000000, true], ['duplicate-every', 0, 1000000, true], ['invalid-every', 0, 1000000, true], ['reconnect-ms', 1, 60000, true]
  ]) {
    const number = Number(values[key]);
    if (!Number.isFinite(number) || number < min || number > max || integer && !Number.isInteger(number)) throw new Error(`Invalid --${key}: expected ${min} through ${max}`);
    values[key] = number;
  }
  return values;
}

export async function runSimulator(options, { signal, log = data => console.log(JSON.stringify(data)), input = process.stdin, output = process.stdout } = {}) {
  let socket, connecting = null, stopping = false, heartbeatRecovery = null, sent = 0;
  const started = Date.now();
  function connect() {
    signal?.throwIfAborted();
    if (socket?.readyState === WebSocket.OPEN) return Promise.resolve(socket);
    if (connecting) return connecting;
    const attempt = new Promise((resolve, reject) => {
      const ws = socket = new WebSocket(options.url, { headers: { Authorization: `Bearer ${options.token}` }, handshakeTimeout: 5000, maxPayload: 16384, perMessageDeflate: false });
      const timer = setTimeout(() => { ws.terminate(); reject(new Error('network_ready_timeout')); }, 5000);
      const abort = () => ws.terminate();
      signal?.addEventListener('abort', abort, { once: true });
      const fail = error => { clearTimeout(timer); reject(error); ws.terminate(); };
      ws.on('error', error => fail(new Error(`network_connection_failed_${error.code || 'transport'}`)));
      ws.once('close', () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new Error('network_disconnected')); });
      ws.once('unexpected-response', (_request, response) => {
        response.resume();
        fail(new Error([409, 429, 503].includes(response.statusCode) ? `network_upgrade_retry_${response.statusCode}` : `Sensor upgrade rejected: HTTP ${response.statusCode}`));
      });
      ws.once('message', data => {
        clearTimeout(timer);
        let ready;
        try { ready = JSON.parse(data.toString()); } catch { fail(new Error('Invalid gateway response')); return; }
        if (ready.type !== 'sensor.ready' || ready.schemaVersion !== 1 || ready.deviceId !== options.device || ready.locationId !== options.location || ready.dataSource !== 'simulated') {
          fail(new Error('Simulator requires its assigned test/simulator device; refusing to send to a real registration')); return;
        }
        startHeartbeat(ws, { intervalMs: options['heartbeat-ms'] || 30000, onTimeout: () => {
          log({ event: 'heartbeat_timeout' });
          if (!stopping && !heartbeatRecovery) heartbeatRecovery = recoverHeartbeat().finally(() => { heartbeatRecovery = null; });
        } });
        log({ event: 'connected', deviceId: ready.deviceId, locationId: ready.locationId, dataSource: ready.dataSource });
        resolve(ws);
      });
    });
    connecting = attempt;
    return attempt.finally(() => { if (connecting === attempt) connecting = null; });
  }
  async function recoverHeartbeat() {
    while (!stopping && !signal?.aborted) {
      try {
        await delay(options['reconnect-ms'], undefined, { signal });
        if (stopping) return;
        await connect(); return;
      } catch (error) {
        if (!error.message.startsWith('network_')) { log({ event: 'heartbeat_reconnect_failed' }); return; }
      }
    }
  }
  async function exchange(payload, disconnect = false) {
    const ws = await connect();
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); ws.off('message', message); ws.off('close', closed); };
      const closed = () => { cleanup(); reject(new Error('network_disconnected')); };
      const timer = setTimeout(() => { cleanup(); ws.terminate(); reject(new Error('network_ack_timeout')); }, 5000);
      function message(data) {
        let result;
        try { result = JSON.parse(data.toString()); } catch { cleanup(); reject(new Error('Invalid gateway response')); return; }
        if (result.messageId !== payload.messageId) return;
        cleanup(); resolve(result);
      }
      ws.on('message', message); ws.once('close', closed);
      ws.send(JSON.stringify(payload), error => { if (error) closed(); else if (disconnect) ws.terminate(); });
    });
  }
  async function sendReading() {
    signal?.throwIfAborted();
    const sequence = sent + 1;
    // Keep exactly the same envelope and ID until acknowledged after reconnect.
    const payload = { schemaVersion: 1, type: 'sensor.telemetry', messageId: randomUUID(), deviceId: options.device, locationId: options.location,
      timestamp: new Date().toISOString(), dataSource: 'simulated', occupancy: { observedPeople: options.people, confidence: 0.87 },
      noise: { rms: 10 ** (options.noise / 20), dbfs: options.noise, estimatedDbSpl: null, calibrated: false },
      device: { batteryPercent: options.battery, batteryTemperatureC: 36.5, charging: true, inferenceMs: 1200, uptimeSeconds: Math.floor((Date.now() - started) / 1000) } };
    if (options['invalid-every'] && sequence % options['invalid-every'] === 0) {
      const rejected = await exchange({ ...payload, messageId: randomUUID(), occupancy: { observedPeople: -1, confidence: 0.87 } });
      if (rejected.type !== 'sensor.error') throw new Error('Invalid telemetry was unexpectedly accepted');
      log({ event: 'expected_error', ...rejected });
    }
    let disconnect = !!options['disconnect-every'] && sequence % options['disconnect-every'] === 0;
    for (;;) {
      signal?.throwIfAborted();
      try {
        const result = await exchange(payload, disconnect);
        if (result.type !== 'sensor.ack') throw new Error(`Telemetry rejected: ${result.error?.code || 'invalid response'}`);
        log({ event: 'ack', ...result }); break;
      } catch (error) {
        if (!error.message.startsWith('network_')) throw error;
        log({ event: 'retry', messageId: payload.messageId }); disconnect = false;
        await delay(options['reconnect-ms'], undefined, { signal });
      }
    }
    if (options['duplicate-every'] && sequence % options['duplicate-every'] === 0) {
      const result = await exchange(payload);
      if (result.status !== 'duplicate') throw new Error('Duplicate was not acknowledged idempotently');
      log({ event: 'duplicate', ...result });
    }
    sent++;
  }
  try {
    await connect();
    if (options.mode === 'manual') {
      const reader = createInterface({ input, output, terminal: !!input.isTTY, signal });
      log({ event: 'manual', commands: ['send', 'people 8', 'noise -37.1', 'battery 85', 'quit'] });
      try {
        for await (const line of reader) {
          const [command, raw] = line.trim().split(/\s+/);
          if (command === 'quit') break;
          if (command === 'send' || !command) { await sendReading(); if (options.count && sent >= options.count) break; }
          else if (['people', 'noise', 'battery'].includes(command)) {
            const value = Number(raw), ranges = { people: [0, 10000], noise: [-160, 0], battery: [0, 100] }, [min, max] = ranges[command];
            if (!Number.isFinite(value) || value < min || value > max || command === 'people' && !Number.isInteger(value)) log({ event: 'invalid_command', command });
            else options[command] = value;
          } else log({ event: 'invalid_command', command });
        }
      } finally { reader.close(); }
    } else {
      while (!options.count || sent < options.count) {
        await sendReading();
        if (!options.count || sent < options.count) await delay(options.interval, undefined, { signal });
      }
    }
    return { sent };
  } finally {
    stopping = true;
    await heartbeatRecovery;
    if (socket && socket.readyState !== WebSocket.CLOSED) await new Promise(resolve => {
      const timer = setTimeout(() => { socket.terminate(); resolve(); }, 1000); timer.unref();
      socket.once('close', () => { clearTimeout(timer); resolve(); });
      if (socket.readyState === WebSocket.OPEN) socket.close(1000, 'Simulator stopped'); else socket.terminate();
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort()); process.once('SIGTERM', () => controller.abort());
  try {
    const options = simulatorOptions();
    if (options.help) console.log('Usage: npm run sensor:simulate -- --device LS-SIM-001 --location CAFE-ID [--url ws://127.0.0.1:8080/ws/sensors] [--token lsd_...] [--interval 15000] [--heartbeat-ms 30000] [--people 8] [--noise=-37.1] [--battery 85] [--mode auto|manual] [--count 3] [--disconnect-every 2] [--duplicate-every 2] [--invalid-every 3] [--reconnect-ms 1000]\nPrefer LS_SENSOR_TOKEN to keep credentials out of process arguments.');
    else await runSimulator(options, { signal: controller.signal });
  } catch (error) { if (!controller.signal.aborted) { console.error(error.message); process.exitCode = 1; } }
}
