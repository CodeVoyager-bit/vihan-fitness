// Creates (or resets the password of) the admin account. There is no public admin sign-up.
// Usage: npm run admin:create -- --phone 98XXXXXXXX --name "Bharat Gite"
//        (password is asked interactively, or read from ADMIN_PASSWORD)
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { phone: { type: "string" }, name: { type: "string", default: "Bharat Gite" } } });
const { db, audit, nowIso } = await import("../src/lib/db");
const { hashPassword, checkPassword, destroyAllSessions } = await import("../src/lib/accounts");
const { normalizePhone } = await import("../src/lib/phone");

const phone = normalizePhone(values.phone ?? "");
if (!phone) throw new Error("Pass --phone with a 10-digit Indian mobile number.");
let password = process.env.ADMIN_PASSWORD ?? "";
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question("New admin password (min 8 chars): ");
  rl.close();
}
checkPassword(password);

const hash = await hashPassword(password);
const existing = db().prepare("SELECT id, role FROM users WHERE phone = ?").get(phone) as { id: number; role: string } | undefined;
if (existing && existing.role !== "admin") throw new Error("That phone belongs to a member account. Use a different number for the admin.");
if (existing) {
  db().prepare("UPDATE users SET password_hash = ?, name = ? WHERE id = ?").run(hash, values.name, existing.id);
  destroyAllSessions(existing.id);
  audit(existing.id, "password.changed", { entity: "user", entityId: existing.id, detail: "reset from command line" });
  console.log(`Admin password reset for ${phone}.`);
} else {
  const r = db()
    .prepare("INSERT INTO users (phone, name, password_hash, role, status, language, created_at) VALUES (?, ?, ?, 'admin', 'approved', 'mr', ?)")
    .run(phone, values.name, hash, nowIso());
  audit(Number(r.lastInsertRowid), "admin.created", { entity: "user", entityId: r.lastInsertRowid });
  console.log(`Admin created: ${values.name} (${phone}).`);
}
