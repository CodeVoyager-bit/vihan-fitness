// Creates any missing monthly charges. Safe to run repeatedly (e.g. a daily cron at 00:05 IST);
// the database's unique index means a repeated run never creates duplicates.
const { generateCharges } = await import("../src/lib/ledger");
const { setting } = await import("../src/lib/db");
if (!setting("launch_month")) {
  console.log("No launch month set yet (Admin → More → Billing). Nothing to do.");
} else {
  console.log(`Monthly charges created: ${generateCharges()}`);
}
