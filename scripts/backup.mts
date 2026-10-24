// Copy of the whole database as Extended JSON lines (safe while the app is running).
// Usage: npm run backup   → backups/vihan-<mode>-YYYY-MM-DDTHH-MM.jsonl, keeps the newest 60.
// Restore: npm run restore -- <file>   (into an empty database)
import fs from "node:fs";
import path from "node:path";

const { appMode, backupLines, closeDb, dbName } = await import("../src/lib/db");
console.log(`Database: ${dbName()}`);
const dir = process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups");
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(":", "-");
const file = path.join(dir, `vihan-${appMode()}-${stamp}.jsonl`);
const out = fs.createWriteStream(file, { mode: 0o600 });
for await (const line of backupLines()) if (!out.write(line)) await new Promise<void>((r) => out.once("drain", () => r()));
await new Promise<void>((r) => out.end(() => r()));
console.log(`Backup written: ${file}`);
await closeDb();

const old = fs.readdirSync(dir).filter((f) => f.startsWith(`vihan-${appMode()}-`) && f.endsWith(".jsonl")).sort().reverse().slice(60);
for (const f of old) fs.rmSync(path.join(dir, f));
