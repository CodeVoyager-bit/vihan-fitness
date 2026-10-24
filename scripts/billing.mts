// Creates any missing monthly charges. Safe to run repeatedly (e.g. a daily cron at 00:05 IST);
// the database's unique index means a repeated run never creates duplicates.
const { generateCharges } = await import("../src/lib/ledger");
const { closeDb, dbName, setting } = await import("../src/lib/db");
console.log(`Database: ${dbName()}`);
if (!(await setting("launch_month"))) {
  console.log("No launch month set yet (Admin → More → Billing). Nothing to do.");
} else {
  console.log(`Monthly charges created: ${await generateCharges()}`);
}
await closeDb();
