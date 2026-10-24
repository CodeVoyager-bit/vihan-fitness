// Creates (or resets the password of) the admin account. There is no public admin sign-up.
// Usage: npm run admin:create -- --phone 98XXXXXXXX --name "Bharat Gite"
//        (password is asked interactively, or read from ADMIN_PASSWORD)
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { phone: { type: "string" }, name: { type: "string", default: "Bharat Gite" } } });
const { audit, closeDb, db, dbName } = await import("../src/lib/db");
console.log(`Database: ${dbName()}`);
const A = await import("../src/lib/accounts");
const { auth } = await import("../src/lib/auth");
const { normalizePhone } = await import("../src/lib/phone");

const phone = normalizePhone(values.phone ?? "");
if (!phone) throw new Error("Pass --phone with a 10-digit Indian mobile number.");
let password = process.env.ADMIN_PASSWORD ?? "";
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question("New admin password (min 8 chars): ");
  rl.close();
}
A.checkPassword(password);

const d = await db();
const existing = await d.users.findOne({ phone });
if (existing && existing.role !== "admin") throw new Error("That phone belongs to a member account. Use a different number for the admin.");
if (existing) {
  await d.users.updateOne({ _id: existing._id }, { $set: { name: values.name } });
  await A.setPassword(existing.uid, password);
  await A.revokeSessions(existing.uid);
  await audit(existing.uid, "password.changed", { entity: "user", entityId: existing.uid, detail: "reset from command line" });
  console.log(`Admin password reset for ${phone}.`);
} else {
  const r = await auth().api.signUpEmail({ body: { email: A.authEmail(phone), password, name: values.name, phone, language: "mr" } });
  await d.users.updateOne({ uid: r.user.uid }, { $set: { role: "admin", status: "approved" } });
  await A.revokeSessions(r.user.uid); // the session sign-up opened for this script
  await audit(r.user.uid, "admin.created", { entity: "user", entityId: r.user.uid });
  console.log(`Admin created: ${values.name} (${phone}).`);
}
await closeDb();
