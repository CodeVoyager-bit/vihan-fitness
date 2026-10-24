// Builds a fresh DEMO database with synthetic members covering every pilot scenario.
// Usage: npm run demo:seed       (never touches the live database)
import crypto from "node:crypto";

process.env.APP_MODE = "demo";
const { closeDb, db, dbName, mongo, nextId, setSetting, nowIso } = await import("../src/lib/db");
if (dbName() !== "vihan_demo") throw new Error(`Refusing to seed ${dbName()}: only the demo database is wiped.`);
await mongo().db(dbName()).dropDatabase();
const d = await db(); // recreates the indexes

const A = await import("../src/lib/accounts");
const { auth } = await import("../src/lib/auth");
const L = await import("../src/lib/ledger");
const E = await import("../src/lib/engage");
const { addDays, addMonths, currentMonth, todayIST } = await import("../src/lib/time");

const TODAY = todayIST();
const NOW = currentMonth();
const PREV = addMonths(NOW, -1);
const PREV2 = addMonths(NOW, -2);
const FEE = 50_000;
const password = A.demoPassword(); // the one-tap demo buttons sign in with it

/** A date in `month` on `day`, never later than today. */
const on = (month: string, day: number) => {
  const d = `${month}-${String(day).padStart(2, "0")}`;
  return d > TODAY ? TODAY : d;
};
const ago = (n: number) => addDays(TODAY, -n);

// ── settings ───────────────────────────────────────────────────────────
await setSetting("launch_month", PREV2);
await setSetting("due_day", "10");
await setSetting("checkin_key", crypto.randomBytes(9).toString("base64url"));
await d.fee_schedule.insertOne({ _id: PREV2, amount_paise: FEE, created_at: nowIso() });
// Public page facts stay empty so the page shows its clearly marked placeholders (nothing invented).

// ── people ─────────────────────────────────────────────────────────────
const mk = async (phone: string, name: string, role: "admin" | "member", status: "pending" | "approved", language: string, createdAt = nowIso()) => {
  const r = await auth().api.signUpEmail({ body: { email: A.authEmail(phone), password, name, phone, language } });
  await d.users.updateOne({ uid: r.user.uid }, { $set: { role, status, createdAt: new Date(createdAt) } });
  return r.user.uid;
};

const admin = await mk("+919000000001", "Bharat Gite", "admin", "approved", "mr");
const people: Record<string, { id: number; start: string }> = {};
const member = async (key: string, n: number, name: string, lang: string, start: string, opening?: { amount: number; note: string }) => {
  const id = await mk(`+9190000000${String(n).padStart(2, "0")}`, name, "member", "pending", lang, `${start}-01T05:00:00.000Z`);
  await L.approveMember(id, { billingStartMonth: start, openingDues: opening ?? null, actorId: admin });
  await d.users.updateOne({ uid: id }, { $set: { reviewed_at: `${start}-01T06:00:00.000Z` } });
  people[key] = { id, start };
  return id;
};

const krish = await member("krish", 10, "Krish Sharma", "en", PREV2);
const rahul = await member("rahul", 11, "Rahul Jadhav", "mr", PREV2);
const sneha = await member("sneha", 12, "Sneha Patil", "mr", PREV2);
const amit = await member("amit", 13, "Amit Mhatre", "mr", PREV2);
const vikas = await member("vikas", 14, "Vikas Thakur", "hi", PREV);
const pooja = await member("pooja", 15, "Pooja Gaikwad", "mr", PREV2);
const sanket = await member("sanket", 16, "Sanket More", "en", PREV2);
const nilesh = await member("nilesh", 17, "Nilesh Shinde", "mr", PREV2, { amount: 50_000, note: "Notebook balance before the app" });
const meena = await member("meena", 18, "Meena Kadam", "mr", PREV2);
const ganesh = await member("ganesh", 19, "Ganesh Pawar", "hi", PREV2);
const priya = await member("priya", 20, "Priya Deshmukh", "en", PREV2);
const aarti = await member("aarti", 21, "Aarti Naik", "mr", NOW);
const suresh = await member("suresh", 22, "Suresh Bhoir", "mr", PREV2);

// Pending registrations (one is a likely duplicate of an existing member).
await mk("+919000000090", "Rohan Kulkarni", "member", "pending", "en", `${ago(1)}T09:12:00.000Z`);
await mk("+919000000091", "Rahul Jadhav", "member", "pending", "mr", `${ago(0)}T04:40:00.000Z`);
await d.audit.insertOne({
  _id: await nextId("audit"),
  at: `${ago(2)}T11:05:00.000Z`,
  actor_id: null,
  action: "registration.duplicate",
  member_id: null,
  entity: null,
  entity_id: null,
  detail: JSON.stringify({ phone: "+91900•••••12" }),
});

// ── money ──────────────────────────────────────────────────────────────
const pay = async (memberId: number, amount: number, date: string, method: "cash" | "upi" | "other" = "cash", reference?: string) =>
  (await L.recordPayment({ memberId, amount, paidOn: date, method, reference, actorId: admin })).paymentId;
const payAllPast = async (id: number, method: "cash" | "upi" = "cash") => {
  await pay(id, FEE, on(PREV2, 6), method);
  await pay(id, FEE, on(PREV, 5), method);
};

await payAllPast(krish, "upi");
await pay(krish, FEE, on(NOW, 4), "upi", "41820");                      // fully paid
await payAllPast(rahul);                                                 // current month unpaid → overdue
await payAllPast(sneha);
await pay(sneha, 20_000, on(NOW, 8), "cash");                            // partial payment
// Amit: nothing paid in three months (multiple unpaid months)
await pay(vikas, FEE, on(PREV, 3), "cash");
await pay(vikas, 3 * FEE, on(NOW, 2), "cash");                           // advance: this month + 2 ahead
await payAllPast(pooja, "upi");
await L.submitClaim(pooja, { amount: FEE, paidOn: ago(1), method: "upi", reference: "UTR 6732", note: "Paid on GPay to Bharat sir" }); // awaiting
await payAllPast(sanket);
const sanketCash = await pay(sanket, FEE, on(NOW, 3), "cash");
const sanketClaim = await L.submitClaim(sanket, { amount: FEE, paidOn: on(NOW, 3), method: "cash", note: "Gave cash at the desk" });
await L.linkClaim(sanketClaim, sanketCash, admin);                       // claim linked to an existing payment
await pay(nilesh, FEE, on(PREV2, 9), "cash");                            // opening balance + PREV still owed
await L.setMemberStatus(nilesh, "paused", NOW, "Out of town for work", admin); // paused with older dues
await payAllPast(meena);
await L.setMemberStatus(meena, "left", NOW, "Moved to Pen", admin);       // left
await payAllPast(ganesh);
const wrong = await pay(ganesh, 5_000, on(NOW, 5), "cash");
await L.reversePayment(wrong, "Typed ₹50 instead of ₹500", admin);       // reversed payment
await pay(ganesh, FEE, on(NOW, 5), "cash");
await payAllPast(priya, "upi");
await pay(priya, FEE, on(NOW, 2), "upi", "99104");
await pay(aarti, FEE, on(NOW, 1), "cash");
await payAllPast(suresh);
await pay(suresh, FEE, on(NOW, 7), "cash");

// A rejected claim in history.
const badClaim = await L.submitClaim(rahul, { amount: FEE, paidOn: on(PREV, 20), method: "upi", reference: "UTR 1180" });
await L.rejectClaim(badClaim, "Couldn't find this UPI payment — it may have failed. Please check with your bank.", admin);

// ── attendance (Asia/Kolkata days) ─────────────────────────────────────
const addVisits = (id: number, dates: string[]) =>
  d.attendance.bulkWrite(
    dates
      .filter((day) => day <= TODAY)
      .map((day) => ({
        updateOne: {
          filter: { member_id: id, visit_date: day },
          update: { $setOnInsert: { recorded_at: `${day}T01:${String((id * 7) % 60).padStart(2, "0")}:00.000Z`, source: id % 2 ? "qr" : "app", created_by: null } },
          upsert: true,
        },
      })),
  );
const pattern = async (id: number, everyDays: number, fromAgo: number, toAgo = 0, jitter = 0) => {
  const out: string[] = [];
  for (let n = fromAgo; n >= toAgo; n -= everyDays) out.push(ago(n + ((id + n) % (jitter + 1))));
  await addVisits(id, out);
};
const thisMonthDays = (n: number) => {
  const today = Number(TODAY.slice(8));
  // Leave today open so the demo member can try checking in.
  const days = Array.from({ length: today - 1 }, (_, i) => i + 1).filter((d) => d % 3 !== 0);
  return days.slice(-n).map((d) => on(NOW, d));
};

await pattern(krish, 3, 60, 25);
await addVisits(krish, thisMonthDays(7));
await pattern(rahul, 3, 55, 12);                                          // last visit 12 days ago → follow-up
await pattern(sneha, 2, 50, 1, 1);
await pattern(amit, 4, 40, 3);
await pattern(vikas, 2, 40, 0, 1);
await pattern(pooja, 3, 45, 2);
await pattern(sanket, 2, 35, 1);
await pattern(nilesh, 5, 60, 30);
await pattern(ganesh, 2, 40, 9);                                          // 9 days quiet
await pattern(priya, 3, 60, 25);
await addVisits(priya, thisMonthDays(9));                                 // goal of 8 completed
await pattern(aarti, 2, Math.min(15, Number(TODAY.slice(8)) - 1), 0);
await pattern(suresh, 2, 60, 0, 1);

await E.setGoal(krish, 12);
await E.setGoal(priya, 8);
await E.setGoal(sneha, 16);
await E.setGoal(aarti, 8);
await d.users.updateOne({ uid: ganesh }, { $set: { followup_opt_in: 0 } }); // opted out

// ── engagement ─────────────────────────────────────────────────────────
for (const item of ["meet", "goals", "equipment", "routine", "firstWeek"]) {
  await E.toggleOnboarding(krish, item, true, admin);
  await E.toggleOnboarding(priya, item, true, admin);
}
await E.toggleOnboarding(aarti, "meet", true, aarti);
await E.toggleOnboarding(aarti, "goals", true, admin);

await E.createHelpRequest(aarti, "routine", "I can come 4 days a week in the evening. Can you give me a beginner routine?");
await E.createHelpRequest(suresh, "general", "Is the gym open on Ganesh Chaturthi?");
const sId = (await d.help_requests.findOne({ member_id: suresh }))!._id;
await E.updateHelpRequest(sId, "resolved", "Open in the morning only that day.", admin);

await E.startChallenge({ template: "target", actorId: admin });
const ch = (await E.activeChallenge())!;
await E.joinChallenge(ch.id, krish, true);
await E.joinChallenge(ch.id, priya, true);
await E.joinChallenge(ch.id, sneha, false);
await E.joinChallenge(ch.id, suresh, true);

await d.reminder_opens.insertOne({ _id: await nextId("reminder_opens"), member_id: amit, kind: "fee", language: "mr", opened_by: admin, opened_at: `${ago(9)}T13:20:00.000Z` });
await d.reminder_opens.insertOne({ _id: await nextId("reminder_opens"), member_id: nilesh, kind: "attendance", language: "mr", opened_by: admin, opened_at: `${ago(20)}T13:20:00.000Z` });
await d.sessions.deleteMany({}); // sign-up signs each account in; nobody needs those sessions

console.log(`Demo database ready: ${dbName()}
  Launch month ${PREV2}, today ${TODAY}, ${Object.keys(people).length} members + 2 pending registrations.
  Demo accounts (password: ${password}) — or use the one-tap demo buttons on /login:
    Admin   Bharat Gite   90000 00001
    Member  Krish Sharma  90000 00010
    Pending Rohan K.      90000 00090`);
void [rahul, amit, pooja, meena, vikas];
await closeDb();
