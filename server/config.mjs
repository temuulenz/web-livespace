// Configuration from environment variables (all optional for local development).
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const int = (value, fallback, min, max) => { const n = Number.parseInt(value, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };

export function loadConfig(env = process.env, overrides = {}) {
  const dataDir = resolve(env.LS_DATA_DIR || join(root, 'data'));
  return {
    port: int(env.PORT, 8080, 0, 65535),
    host: env.HOST || '127.0.0.1',
    staticDir: root,
    dataDir,
    dbFile: env.LS_DB_FILE || join(dataDir, 'livespace.db'),
    // How often browsers poll when the live stream is unavailable (seconds, 15 s – 1 h).
    pollIntervalSec: int(env.LS_POLL_INTERVAL_SEC, 60, 15, 3600),
    // A café's live values are labelled outdated after this many seconds without data.
    staleAfterSec: int(env.LS_STALE_AFTER_SEC, 900, 60, 86400),
    // A device is shown offline when it has not reported for this long.
    deviceOfflineSec: int(env.LS_DEVICE_OFFLINE_SEC, 600, 60, 86400),
    sessionDays: int(env.LS_SESSION_DAYS, 30, 1, 365),
    secureCookies: env.NODE_ENV === 'production' || env.LS_SECURE_COOKIES === '1',
    trustProxy: env.LS_TRUST_PROXY === '1',
    maxPhotoBytes: int(env.LS_MAX_PHOTO_MB, 4, 1, 20) * 1024 * 1024,
    seedDemo: env.LS_SEED_DEMO !== '0',
    adminEmail: env.LS_ADMIN_EMAIL || '',
    adminPassword: env.LS_ADMIN_PASSWORD || '',
    visualizationProvider: undefined,
    ...overrides
  };
}
