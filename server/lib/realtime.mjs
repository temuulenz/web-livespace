// Server-Sent Events hub. Browsers subscribe with EventSource; the server pushes
// a message whenever a new measurement changes a café's public live values.

import { HttpError } from './http.mjs';

// Bounded fan-out: long-lived SSE sockets are capped globally and per client address so a
// single source cannot exhaust file descriptors. Rejections happen before any bytes are sent.
export function createRealtimeHub({ heartbeatMs = 25000, maxClients = 2000, maxPerIp = 20 } = {}) {
  const clients = new Set();
  const scopes = new Map();
  const perIp = new Map();
  const heartbeat = setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, heartbeatMs);
  heartbeat.unref();

  return {
    subscribe(req, res, { retryMs = 5000, cafeId = null, ip = req.socket?.remoteAddress || '' } = {}) {
      if (clients.size >= maxClients || (perIp.get(ip) || 0) >= maxPerIp) throw new HttpError(503, 'stream_capacity', 'Live stream capacity reached; use /api/v1/live polling', { retry_after_sec: 60 });
      perIp.set(ip, (perIp.get(ip) || 0) + 1);
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`retry: ${retryMs}\n\n`);
      clients.add(res); scopes.set(res,cafeId);
      req.on('close', () => { clients.delete(res); scopes.delete(res); const n = (perIp.get(ip) || 1) - 1; if (n > 0) perIp.set(ip, n); else perIp.delete(ip); });
    },
    broadcast(event, data) {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const res of clients) if(!scopes.get(res))res.write(message);
    },
    broadcastCafe(cafe,event,data) {const message=`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;for(const res of clients)if(scopes.get(res)===cafe)res.write(message);},
    get size() { return clients.size; },
    close() { clearInterval(heartbeat); for (const res of clients) res.end(); clients.clear(); scopes.clear(); perIp.clear(); }
  };
}
