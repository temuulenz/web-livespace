// Start the LiveSpace server: `npm start` (see docs/BACKEND.md for configuration).
import { loadConfig } from './config.mjs';
import { createApp } from './app.mjs';

const config = loadConfig();
const app = await createApp(config);
const address = await app.listen();
console.log(`LiveSpace → http://${address.address}:${address.port}  (data: ${config.dataDir})`);
if (!config.adminEmail) console.log('No admin configured. Create one with: npm run create-admin -- <email> <password>');

const stop = async () => { await app.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
