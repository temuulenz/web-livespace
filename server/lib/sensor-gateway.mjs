import { WebSocketServer, WebSocket } from 'ws';
import { HttpError } from './http.mjs';
import { SENSOR_ID } from './telemetry-schema.mjs';

export function createSensorGateway(server, { db, config, sensors, limit }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: config.sensorMaxPayloadBytes, perMessageDeflate: false });
  const connections = new Map();
  let closing = false;
  db.prepare("UPDATE devices SET connection_status = 'offline' WHERE connection_status != 'offline'").run();
  const notify = fn => {
    try { fn(); } catch { console.error(JSON.stringify({ event: 'sensor.notification_failed', message: 'Committed telemetry remains available in SQLite' })); }
  };
  function send(ws, data) {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > config.sensorMaxPayloadBytes * 4) { ws.terminate(); return; }
    ws.send(JSON.stringify(data));
  }
  function reject(socket, error) {
    const status = error instanceof HttpError ? error.status : 500;
    const body = JSON.stringify({ error: { code: error instanceof HttpError ? error.code : 'internal', message: error instanceof HttpError ? error.message : 'Internal server error' } });
    const reason = { 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 429: 'Too Many Requests', 503: 'Service Unavailable' }[status] || 'Error';
    socket.end(`HTTP/1.1 ${status} ${reason}\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }
  function authorize(connection) {
    const current = sensors.authenticate(connection.authorization);
    if (current.id !== connection.device.id || current.cafe_id !== connection.device.cafe_id || sensors.source(current) !== sensors.source(connection.device)) {
      throw new HttpError(403, 'device_assignment_changed', 'Device assignment changed; reconnect');
    }
    return current;
  }
  function status(connection) {
    const last = db.prepare('SELECT last_seen_at FROM devices WHERE id = ?').get(connection.device.id);
    const age = Date.now() - Date.parse(last?.last_seen_at || connection.connectedAt);
    const latest = db.prepare('SELECT MAX(ts) AS ts FROM sensor_latest_readings WHERE device_id = ? AND cafe_id = ? AND data_source = ?')
      .get(connection.device.id, connection.device.cafe_id, sensors.source(connection.device));
    if (age > config.deviceOfflineSec * 1000) return 'offline';
    if ((latest.ts && Date.now() - Date.parse(latest.ts) > config.sensorStaleAfterSec * 1000) || age > config.sensorStaleAfterSec * 1000) return 'stale';
    return 'online';
  }
  function upgrade(req, socket, head) {
    socket.on('error', () => {});
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== '/ws/sensors') throw new HttpError(404, 'not_found', 'Unknown WebSocket endpoint');
      if (closing) throw new HttpError(503, 'shutting_down', 'Server is shutting down');
      if (url.search) throw new HttpError(403, 'query_not_allowed', 'Use the Authorization header');
      const secure = req.socket.encrypted || (config.trustProxy && req.headers['x-forwarded-proto'] === 'https');
      if (config.production && !secure) throw new HttpError(403, 'wss_required', 'Production sensors require WSS');
      const ip = (config.trustProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || socket.remoteAddress || '';
      limit(`sensor-upgrade:${ip}`, 60, 60000);
      const device = sensors.authenticate(req.headers.authorization);
      if (connections.has(device.id)) throw new HttpError(409, 'device_connected', 'This device already has a connection');
      if (connections.size >= config.sensorMaxConnections) throw new HttpError(503, 'connection_limit', 'Sensor connection limit reached');
      wss.handleUpgrade(req, socket, head, ws => {
        const connection = { ws, device, authorization: req.headers.authorization, alive: true, connectedAt: new Date().toISOString(), errors: 0 };
        connections.set(device.id, connection);
        ws.on('error', () => {}); // Framing/size errors close through ws itself.
        ws.on('pong', () => { connection.alive = true; });
        ws.on('close', () => {
          if (connections.get(device.id) !== connection) return;
          connections.delete(device.id);
          notify(() => sensors.setStatus(device, 'offline'));
        });
        ws.on('message', (data, binary) => {
          let input, result, current;
          try {
            current = authorize(connection);
            limit(`sensor-message:${device.id}`, config.sensorRatePerMinute, 60000);
            if (binary) throw new HttpError(415, 'json_only', 'Only UTF-8 JSON text telemetry is accepted');
            try { input = JSON.parse(data.toString('utf8')); }
            catch { throw new HttpError(400, 'invalid_json', 'Malformed JSON'); }
            result = sensors.ingest(current, input);
          } catch (error) {
            const known = error instanceof HttpError;
            send(ws, { type: 'sensor.error', ...(typeof input?.messageId === 'string' && SENSOR_ID.test(input.messageId) ? { messageId: input.messageId } : {}),
              error: { code: known ? error.code : 'storage_failed', message: known ? error.message : 'Telemetry could not be stored; retry with the same message ID', ...(known && error.details ? { details: error.details } : {}) } });
            if (++connection.errors >= 5 || [401, 403, 429].includes(error.status)) ws.close(1008, 'Sensor policy violation');
            return;
          }
          // SQLite COMMIT precedes the ack; notification failures cannot undo it.
          send(ws, result.ack);
          notify(() => { sensors.setStatus(current, status(connection)); sensors.publish(result); });
        });
        notify(() => sensors.setStatus(device, status(connection)));
        send(ws, { type: 'sensor.ready', schemaVersion: 1, deviceId: device.id, locationId: device.cafe_id, dataSource: sensors.source(device), maxPayloadBytes: config.sensorMaxPayloadBytes });
      });
    } catch (error) { reject(socket, error); }
  }
  server.on('upgrade', upgrade);
  function sweep() {
    for (const connection of connections.values()) {
      try { authorize(connection); }
      catch { connection.ws.close(1008, 'Device authorization changed'); continue; }
      if (!connection.alive) { connection.ws.terminate(); continue; }
      connection.alive = false;
      connection.ws.ping();
      notify(() => sensors.setStatus(connection.device, status(connection)));
    }
  }
  const heartbeat = setInterval(sweep, config.sensorHeartbeatMs); heartbeat.unref();
  const retention = setInterval(() => { try { sensors.retain(); } catch { /* Retry next hour. */ } }, 3600000); retention.unref();
  return {
    get size() { return connections.size; },
    async close() {
      closing = true;
      clearInterval(heartbeat); clearInterval(retention);
      server.off('upgrade', upgrade);
      for (const { ws } of connections.values()) ws.close(1001, 'Server shutting down');
      const force = setTimeout(() => { for (const { ws } of connections.values()) ws.terminate(); }, 1000); force.unref();
      await new Promise(resolve => wss.close(resolve));
      clearTimeout(force);
    }
  };
}
