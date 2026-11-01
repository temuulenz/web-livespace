// Server-Sent Events hub. Browsers subscribe with EventSource; the server pushes
// a message whenever a new measurement changes a café's public live values.

export function createRealtimeHub({ heartbeatMs = 25000 } = {}) {
  const clients = new Set();
  const heartbeat = setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, heartbeatMs);
  heartbeat.unref();

  return {
    subscribe(req, res, { retryMs = 5000 } = {}) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`retry: ${retryMs}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
    },
    broadcast(event, data) {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const res of clients) res.write(message);
    },
    get size() { return clients.size; },
    close() { clearInterval(heartbeat); for (const res of clients) res.end(); clients.clear(); }
  };
}
