// Loads a backup made by `npm run backup` (or Admin → More → Backup) into an EMPTY database.
// Usage: npm run restore -- backups/vihan-live-2026-10-24T10-00.jsonl
import fs from "node:fs";
import readline from "node:readline";
import { BSON, type Collection, type Document } from "mongodb";

const file = process.argv[2];
if (!file || !fs.existsSync(file)) throw new Error("Pass the backup file: npm run restore -- <file>");
const { closeDb, db, dbName } = await import("../src/lib/db");
const d = await db();
if (await d.users.count()) throw new Error(`${dbName()} already has users. Restore only into an empty database.`);

const docs = new Map<string, Document[]>();
for await (const line of readline.createInterface({ input: fs.createReadStream(file) })) {
  if (!line.trim()) continue;
  const { c, d: doc } = BSON.EJSON.parse(line, { relaxed: false }) as { c: string; d: Document };
  let rows = docs.get(c);
  if (!rows) docs.set(c, (rows = []));
  rows.push(doc);
}
for (const [name, rows] of docs) {
  const c = (d[name as keyof typeof d] as { raw: Collection<Document> } | undefined)?.raw;
  if (!c) throw new Error(`Unknown collection in backup: ${name}`);
  // Settings already hold fresh defaults; the backup's values win.
  await c.bulkWrite(rows.map((r) => ({ replaceOne: { filter: { _id: r._id }, replacement: r, upsert: true } })));
  console.log(`${name}: ${rows.length}`);
}
console.log(`Restored into ${dbName()}.`);
await closeDb();
