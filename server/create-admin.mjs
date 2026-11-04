// npm run create-admin -- <email> <password> [name]
// Creates an admin account (or promotes an existing one) in the configured database.
import { loadConfig } from './config.mjs';
import { openDatabase } from './lib/db.mjs';
import { ensureAdmin } from './seed.mjs';

const [email, password, name = 'Admin'] = process.argv.slice(2);
if (!email || !password || password.length < 10) {
  console.error('Usage: npm run create-admin -- <email> <password (≥ 10 characters)> [name]');
  process.exit(1);
}
const db = openDatabase(loadConfig().dbFile);
await ensureAdmin(db, email, password, name);
db.close();
console.log(`Admin ready: ${email}`);
