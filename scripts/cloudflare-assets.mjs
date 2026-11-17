// Copy only public assets; never publish repository/server/secrets as static assets.
import { securityHeaders } from '../cloudflare/security.mjs';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
await rm('.cloudflare-assets', { recursive: true, force: true });
await mkdir('.cloudflare-assets');
for (const file of ['index.html', 'app.js', 'styles.css', 'logo.webp', 'js', 'styles', 'framework']) {
  await cp(file, `.cloudflare-assets/${file}`, { recursive: true });
}

await writeFile('.cloudflare-assets/_headers', '/*\n' + Object.entries(securityHeaders).map(([k,v]) => `  ${k}: ${v}`).join('\n') + '\n');
