// Online, consistent copy of the SQLite database (safe while the app is running).
// Usage: npm run backup   → backups/vihan-YYYY-MM-DDTHH-MM.db, keeps the newest 60.
import fs from "node:fs";
import path from "node:path";

const { db, appMode } = await import("../src/lib/db");
const dir = process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups");
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(":", "-");
const file = path.join(dir, `vihan-${appMode()}-${stamp}.db`);
await db().backup(file);
console.log(`Backup written: ${file}`);

const old = fs.readdirSync(dir).filter((f) => f.startsWith(`vihan-${appMode()}-`) && f.endsWith(".db")).sort().reverse().slice(60);
for (const f of old) fs.rmSync(path.join(dir, f));
