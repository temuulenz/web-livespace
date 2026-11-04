// Live updates: Server-Sent Events first, periodic polling as the fallback.
//
//   const channel = createLiveChannel({
//     streamUrl: '/api/v1/stream',          // EventSource endpoint
//     poll: () => api.get('/live'),         // fallback fetch, returns the same payloads
//     interval: 60_000,                     // polling period (configurable)
//     events: ['measurement'],
//     onMessage: (type, data) => …,
//     onStatus: status => …                 // 'connecting' | 'live' | 'polling' | 'paused' | 'stopped'
//   });
//   channel.start(); … channel.stop();
//
// While SSE is connected nothing is polled. If the stream fails repeatedly the channel
// polls instead and keeps trying to reconnect with backoff. Polling pauses while the
// tab is hidden and runs once immediately when it becomes visible again.

export function createLiveChannel({ streamUrl, poll, interval = 60000, events = ['message'], onMessage, onStatus, EventSourceImpl = globalThis.EventSource, doc = globalThis.document, maxBackoff = 60000 } = {}) {
  let source = null, pollTimer = null, retryTimer = null, failures = 0, status = 'stopped', running = false;

  const setStatus = next => { if (next !== status) { status = next; onStatus?.(next); } };

  async function pollOnce() {
    if (!poll || !running) return;
    try {
      const batch = await poll();
      for (const [type, data] of batch || []) onMessage?.(type, data);
    } catch { /* keep the last known values; freshness labels show the age */ }
  }

  function startPolling() {
    if (pollTimer || !poll) return;
    setStatus(doc?.hidden ? 'paused' : 'polling');
    pollTimer = setInterval(() => { if (!doc?.hidden) pollOnce(); }, interval);
  }
  function stopPolling() { clearInterval(pollTimer); pollTimer = null; }

  function connect() {
    if (!running) return;
    if (!streamUrl || !EventSourceImpl) { startPolling(); pollOnce(); return; }
    setStatus('connecting');
    source = new EventSourceImpl(streamUrl, { withCredentials: true });
    source.onopen = () => { failures = 0; stopPolling(); setStatus('live'); };
    for (const type of events) source.addEventListener(type, event => { try { onMessage?.(type, JSON.parse(event.data)); } catch { /* ignore malformed */ } });
    source.onerror = () => {
      source?.close(); source = null;
      failures++;
      startPolling();
      if (failures === 1) pollOnce();
      const delay = Math.min(maxBackoff, 2000 * 2 ** Math.min(failures, 5));
      retryTimer = setTimeout(connect, delay);
    };
  }

  const onVisibility = () => {
    if (!running) return;
    if (doc.hidden) { if (pollTimer) setStatus('paused'); }
    else if (pollTimer) { setStatus('polling'); pollOnce(); }
  };

  return {
    start() {
      if (running) return;
      running = true;
      doc?.addEventListener('visibilitychange', onVisibility);
      connect();
    },
    stop() {
      running = false;
      source?.close(); source = null;
      stopPolling(); clearTimeout(retryTimer);
      doc?.removeEventListener('visibilitychange', onVisibility);
      setStatus('stopped');
    },
    refresh: pollOnce,
    get status() { return status; }
  };
}
