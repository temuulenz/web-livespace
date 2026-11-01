// JSON API client.
//
//   const api = createApiClient({ baseUrl: '/api/v1', timeout: 8000 });
//   const cafes = await api.get('/cafes');
//   await api.post('/auth/login', { email, password });
//
// Every failure becomes an ApiError with `status` (0 = network/timeout), a machine
// readable `code` and a human `message`, so callers handle one error type. Requests
// send cookies for the same origin; GET requests retry once on a network failure.

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || code || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code || (status ? `http_${status}` : 'network');
    this.details = details;
  }
  get isNetwork() { return this.status === 0; }
  get isUnauthorized() { return this.status === 401; }
}

export function createApiClient({ baseUrl = '', timeout = 10000, headers: defaultHeaders = {}, onUnauthorized, fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
  async function request(method, path, body, { signal, timeout: ms = timeout, headers = {}, retry = method === 'GET' ? 1 : 0 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), ms);
    const abortOuter = () => controller.abort(signal.reason);
    signal?.addEventListener('abort', abortOuter, { once: true });
    try {
      const response = await fetchImpl(baseUrl + path, {
        method,
        credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...defaultHeaders, ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      const text = await response.text();
      let data = null;
      if (text) { try { data = JSON.parse(text); } catch { data = { message: text }; } }
      if (!response.ok) {
        const error = new ApiError(response.status, data?.error?.code || data?.code, data?.error?.message || data?.message, data?.error?.details);
        if (response.status === 401) onUnauthorized?.(error);
        throw error;
      }
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (signal?.aborted) throw error;
      if (retry > 0) return request(method, path, body, { signal, timeout: ms, headers, retry: retry - 1 });
      throw new ApiError(0, controller.signal.aborted ? 'timeout' : 'network', error?.message);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abortOuter);
    }
  }

  return {
    request,
    get: (path, options) => request('GET', path, undefined, options),
    post: (path, body = {}, options) => request('POST', path, body, options),
    put: (path, body = {}, options) => request('PUT', path, body, options),
    patch: (path, body = {}, options) => request('PATCH', path, body, options),
    del: (path, options) => request('DELETE', path, undefined, options)
  };
}
