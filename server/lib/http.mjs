// Minimal HTTP toolkit: routing, JSON bodies, cookies, errors and static files.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

export class HttpError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}
export const badRequest = (message, details) => new HttpError(400, 'bad_request', message, details);
export const notFound = (message = 'Not found') => new HttpError(404, 'not_found', message);

export function createRouter() {
  const routes = [];
  const add = (method, path, ...handlers) => {
    const names = [];
    const regex = new RegExp('^' + path.replace(/:(\w+)/g, (_, name) => { names.push(name); return '([^/]+)'; }) + '/?$');
    routes.push({ method, regex, names, handlers });
  };
  return {
    get: (p, ...h) => add('GET', p, ...h), post: (p, ...h) => add('POST', p, ...h), put: (p, ...h) => add('PUT', p, ...h),
    patch: (p, ...h) => add('PATCH', p, ...h), delete: (p, ...h) => add('DELETE', p, ...h),
    // Returns false when no route matches the path (so static serving can take over).
    async handle(ctx) {
      let pathMatched = false;
      for (const route of routes) {
        const found = route.regex.exec(ctx.path);
        if (!found) continue;
        pathMatched = true;
        if (route.method !== ctx.method) continue;
        ctx.params = Object.fromEntries(route.names.map((name, i) => [name, decodeURIComponent(found[i + 1])]));
        for (const handler of route.handlers) {
          const result = await handler(ctx);
          if (ctx.res.writableEnded || result === false) break;
        }
        return true;
      }
      if (pathMatched) throw new HttpError(405, 'method_not_allowed', 'Method not allowed');
      return false;
    }
  };
}

export function readBody(req, limit) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { reject(new HttpError(413, 'payload_too_large', `Request body exceeds ${Math.round(limit / 1024)} KB`)); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readJson(ctx, limit = 64 * 1024) {
  if (!/^application\/json\b/i.test(ctx.req.headers['content-type'] || '')) throw new HttpError(415, 'unsupported_media_type', 'Content-Type must be application/json');
  const buffer = await readBody(ctx.req, limit);
  if (!buffer.length) return {};
  try { return JSON.parse(buffer.toString('utf8')); }
  catch { throw badRequest('Malformed JSON'); }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore malformed */ } }
  }
  return out;
}

export function cookie(name, value, { maxAge, secure, httpOnly = true, sameSite = 'Lax', path = '/' } = {}) {
  let out = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (maxAge != null) out += `; Max-Age=${maxAge}`;
  if (httpOnly) out += '; HttpOnly';
  if (secure) out += '; Secure';
  return out;
}

export function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body), ...headers });
  res.end(body);
}

export function sendError(res, error) {
  if (res.headersSent) { res.end(); return; }
  const status = error instanceof HttpError ? error.status : 500;
  const payload = { error: { code: error instanceof HttpError ? error.code : 'internal', message: error instanceof HttpError ? error.message : 'Internal server error' } };
  if (error instanceof HttpError && error.details) payload.error.details = error.details;
  sendJson(res, status, payload);
}

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// Serves only the public website files; server code, data, tests and docs are never exposed.
export function createStaticHandler(root, { allow = ['index.html', 'app.js', 'styles.css', 'logo.webp', 'js/', 'styles/', 'framework/'] } = {}) {
  root = resolve(root);
  return async function serveStatic(ctx) {
    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') return false;
    let relative = ctx.path === '/' ? 'index.html' : ctx.path.replace(/^\/+/, '');
    if (!allow.some(entry => entry.endsWith('/') ? relative.startsWith(entry) : relative === entry)) return false;
    const file = resolve(root, relative);
    if (!file.startsWith(root + sep)) return false;
    let info;
    try { info = await stat(file); } catch { return false; }
    if (!info.isFile()) return false;
    const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
    // HTML must revalidate so new releases are picked up; versioned assets may be cached briefly.
    const cache = type.startsWith('text/html') ? 'no-cache' : 'public, max-age=300';
    const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    if (ctx.req.headers['if-none-match'] === etag) { ctx.res.writeHead(304, { ETag: etag, 'Cache-Control': cache }); ctx.res.end(); return true; }
    ctx.res.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size, 'Cache-Control': cache, ETag: etag });
    if (ctx.method === 'HEAD') { ctx.res.end(); return true; }
    await new Promise((done, fail) => createReadStream(file).on('error', fail).on('end', done).pipe(ctx.res));
    return true;
  };
}

export { join };
