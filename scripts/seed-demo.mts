// Builds a fresh DEMO database with synthetic members covering every pilot scenario.
// Usage: npm run demo:seed       (never touches the live database)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

process.env.APP_MODE = "demo";
const file = process.env.DATABASE_PATH ?? (await import("../src/lib/db")).dbPath();
if (!/demo/i.test(path.basename(file))) throw new Error(`Refusing to seed ${file}: demo database file names must contain "demo".`);
process.env.DATABASE_PATH = file;
for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });

const { db, setSetting, nowIso } = await import("../src/lib/db");
const A = await import("../src/lib/accounts");
const L = await import("../src/lib/ledger");
const E = await import("../src/lib/engage");
const { addDays, addMonths, currentMonth, todayIST } = await import("../src/lib/time");

const TODAY = todayIST();
const NOW = currentMonth();
const PREV = addMonths(NOW, -1);
const PREV2 = addMonths(NOW, -2);
const FEE = 50_000;
const password = process.env.DEMO_PASSWORD || crypto.randomBytes(6).toString("base64url");

/** A date in `month` on `day`, never later than today. */
const on = (month: string, day: number) => {
  const d = `${month}-${String(day).padStart(2, "0")}`;
  return d > TODAY ? TODAY : d;
};
const ago = (n: number) => addDays(TODAY, -n);

// ── settings ───────────────────────────────────────────────────────────
setSetting("launch_month", PREV2);
setSetting("due_day", "10");
setSetting("checkin_key", crypto.randomBytes(9).toString("base64url"));
db().prepare("INSERT INTO fee_schedule (effective_month, amount_paise, created_at) VALUES (?, ?, ?)").run(PREV2, FEE, nowIso());
// Public page facts stay empty so the page shows its clearly marked placeholders (nothing invented).

// ── people ─────────────────────────────────────────────────────────────
const hash = await A.hashPassword(password);
const mk = (phone: string, name: string, role: "admin" | "member", status: string, language: string, createdAt = nowIso()) =>
  Number(
    db()
      .prepare("INSERT INTO users (phone, name, password_hash, role, status, language, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(phone, name, hash, role, status, language, createdAt).lastInsertRowid,
  );

const admin = mk("+919000000001", "Bharat Gite", "admin", "approved", "mr");
const people: Record<string, { id: number; start: string }> = {};
const member = (key: string, n: number, name: string, lang: string, start: string, opening?: { amount: number; note: string }) => {
  const id = mk(`+9190000000${String(n).padStart(2, "0")}`, name, "member", "pending", lang, `${start}-01T05:00:00.000Z`);
  L.approveMember(id, { billingStartMonth: start, openingDues: opening ?? null, actorId: admin });
  db().prepare("UPDATE users SET reviewed_at = ? WHERE id = ?").run(`${start}-01T06:00:00.000Z`, id);
  people[key] = { id, start };
  return id;
};

const krish = member("krish", 10, "Krish Sharma", "en", PREV2);
const rahul = member("rahul", 11, "Rahul Jadhav", "mr", PREV2);
const sneha = member("sneha", 12, "Sneha Patil", "mr", PREV2);
const amit = member("amit", 13, "Amit Mhatre", "mr", PREV2);
const vikas = member("vikas", 14, "Vikas Thakur", "hi", PREV);
const pooja = member("pooja", 15, "Pooja Gaikwad", "mr", PREV2);
const sanket = member("sanket", 16, "Sanket More", "en", PREV2);
const nilesh = member("nilesh", 17, "Nilesh Shinde", "mr", PREV2, { amount: 50_000, note: "Notebook balance before the app" });
const meena = member("meena", 18, "Meena Kadam", "mr", PREV2);
const ganesh = member("ganesh", 19, "Ganesh Pawar", "hi", PREV2);
const priya = member("priya", 20, "Priya Deshmukh", "en", PREV2);
const aarti = member("aarti", 21, "Aarti Naik", "mr", NOW);
const suresh = member("suresh", 22, "Suresh Bhoir", "mr", PREV2);

// Pending registrations (one is a likely duplicate of an existing member).
mk("+919000000090", "Rohan Kulkarni", "member", "pending", "en", `${ago(1)}T09:12:00.000Z`);
mk("+919000000091", "Rahul Jadhav", "member", "pending", "mr", `${ago(0)}T04:40:00.000Z`);
db().prepare("INSERT INTO audit (at, action, detail) VALUES (?, 'registration.duplicate', ?)").run(`${ago(2)}T11:05:00.000Z`, JSON.stringify({ phone: "+91900•••••12" }));

// ── money ──────────────────────────────────────────────────────────────
const pay = (memberId: number, amount: number, date: string, method: "cash" | "upi" | "other" = "cash", reference?: string) =>
  L.recordPayment({ memberId, amount, paidOn: date, method, reference, actorId: admin }).paymentId;
const payAllPast = (id: number, method: "cash" | "upi" = "cash") => {
  pay(id, FEE, on(PREV2, 6), method);
  pay(id, FEE, on(PREV, 5), method);
};

payAllPast(krish, "upi");
pay(krish, FEE, on(NOW, 4), "upi", "41820");                      // fully paid
payAllPast(rahul);                                                 // current month unpaid → overdue
payAllPast(sneha);
pay(sneha, 20_000, on(NOW, 8), "cash");                            // partial payment
// Amit: nothing paid in three months (multiple unpaid months)
pay(vikas, FEE, on(PREV, 3), "cash");
pay(vikas, 3 * FEE, on(NOW, 2), "cash");                           // advance: this month + 2 ahead
payAllPast(pooja, "upi");
L.submitClaim(pooja, { amount: FEE, paidOn: ago(1), method: "upi", reference: "UTR 6732", note: "Paid on GPay to Bharat sir" }); // awaiting
payAllPast(sanket);
const sanketCash = pay(sanket, FEE, on(NOW, 3), "cash");
const sanketClaim = L.submitClaim(sanket, { amount: FEE, paidOn: on(NOW, 3), method: "cash", note: "Gave cash at the desk" });
L.linkClaim(sanketClaim, sanketCash, admin);                       // claim linked to an existing payment
pay(nilesh, FEE, on(PREV2, 9), "cash");                            // opening balance + PREV still owed
L.setMemberStatus(nilesh, "paused", NOW, "Out of town for work", admin); // paused with older dues
payAllPast(meena);
L.setMemberStatus(meena, "left", NOW, "Moved to Pen", admin);       // left
payAllPast(ganesh);
const wrong = pay(ganesh, 5_000, on(NOW, 5), "cash");
L.reversePayment(wrong, "Typed ₹50 instead of ₹500", admin);       // reversed payment
pay(ganesh, FEE, on(NOW, 5), "cash");
payAllPast(priya, "upi");
pay(priya, FEE, on(NOW, 2), "upi", "99104");
pay(aarti, FEE, on(NOW, 1), "cash");
payAllPast(suresh);
pay(suresh, FEE, on(NOW, 7), "cash");

// A rejected claim in history.
const badClaim = L.submitClaim(rahul, { amount: FEE, paidOn: on(PREV, 20), method: "upi", reference: "UTR 1180" });
L.rejectClaim(badClaim, "Couldn't find this UPI payment — it may have failed. Please check with your bank.", admin);

// ── attendance (Asia/Kolkata days) ─────────────────────────────────────
const addVisits = (id: number, dates: string[]) => {
  const ins = db().prepare("INSERT OR IGNORE INTO attendance (member_id, visit_date, recorded_at, source) VALUES (?, ?, ?, ?)");
  for (const d of dates) if (d <= TODAY) ins.run(id, d, `${d}T01:${String((id * 7) % 60).padStart(2, "0")}:00.000Z`, id % 2 ? "qr" : "app");
};
const pattern = (id: number, everyDays: number, fromAgo: number, toAgo = 0, jitter = 0) => {
  const out: string[] = [];
  for (let n = fromAgo; n >= toAgo; n -= everyDays) out.push(ago(n + ((id + n) % (jitter + 1))));
  addVisits(id, out);
};
const thisMonthDays = (n: number) => {
  const today = Number(TODAY.slice(8));
  // Leave today open so the demo member can try checking in.
  const days = Array.from({ length: today - 1 }, (_, i) => i + 1).filter((d) => d % 3 !== 0);
  return days.slice(-n).map((d) => on(NOW, d));
};

pattern(krish, 3, 60, 25);
addVisits(krish, thisMonthDays(7));
pattern(rahul, 3, 55, 12);                                          // last visit 12 days ago → follow-up
pattern(sneha, 2, 50, 1, 1);
pattern(amit, 4, 40, 3);
pattern(vikas, 2, 40, 0, 1);
pattern(pooja, 3, 45, 2);
pattern(sanket, 2, 35, 1);
pattern(nilesh, 5, 60, 30);
pattern(ganesh, 2, 40, 9);                                          // 9 days quiet
pattern(priya, 3, 60, 25);
addVisits(priya, thisMonthDays(9));                                 // goal of 8 completed
pattern(aarti, 2, Math.min(15, Number(TODAY.slice(8)) - 1), 0);
pattern(suresh, 2, 60, 0, 1);

E.setGoal(krish, 12);
E.setGoal(priya, 8);
E.setGoal(sneha, 16);
E.setGoal(aarti, 8);
db().prepare("UPDATE members SET followup_opt_in = 0 WHERE user_id = ?").run(ganesh); // opted out

// ── engagement ─────────────────────────────────────────────────────────
for (const item of ["meet", "goals", "equipment", "routine", "firstWeek"]) {
  E.toggleOnboarding(krish, item, true, admin);
  E.toggleOnboarding(priya, item, true, admin);
}
E.toggleOnboarding(aarti, "meet", true, aarti);
E.toggleOnboarding(aarti, "goals", true, admin);

E.createHelpRequest(aarti, "routine", "I can come 4 days a week in the evening. Can you give me a beginner routine?");
E.createHelpRequest(suresh, "general", "Is the gym open on Ganesh Chaturthi?");
const sId = (db().prepare("SELECT id FROM help_requests WHERE member_id = ?").get(suresh) as { id: number }).id;
E.updateHelpRequest(sId, "resolved", "Open in the morning only that day.", admin);

E.startChallenge({ template: "target", actorId: admin });
const ch = E.activeChallenge()!;
E.joinChallenge(ch.id, krish, true);
E.joinChallenge(ch.id, priya, true);
E.joinChallenge(ch.id, sneha, false);
E.joinChallenge(ch.id, suresh, true);

db().prepare("INSERT INTO reminder_opens (member_id, kind, language, opened_by, opened_at) VALUES (?, 'fee', 'mr', ?, ?)").run(amit, admin, `${ago(9)}T13:20:00.000Z`);
db().prepare("INSERT INTO reminder_opens (member_id, kind, language, opened_by, opened_at) VALUES (?, 'attendance', 'mr', ?, ?)").run(nilesh, admin, `${ago(20)}T13:20:00.000Z`);

console.log(`Demo database ready: ${file}
  Launch month ${PREV2}, today ${TODAY}, ${Object.keys(people).length} members + 2 pending registrations.
  Demo accounts (password: ${password}) — or use the one-tap demo buttons on /login:
    Admin   Bharat Gite   90000 00001
    Member  Krish Sharma  90000 00010
    Pending Rohan K.      90000 00090`);
void [rahul, amit, pooja, meena, vikas];
