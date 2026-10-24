// Business-rule tests against a throwaway MongoDB (a one-node replica set, so transactions work),
// emptied before every test. Uses the local `mongod` when installed, otherwise downloads one once.
// Run: npm test
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, beforeEach, describe, test } from "node:test";
import { BSON, ObjectId } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";

process.env.APP_MODE = "test";
process.env.BETTER_AUTH_SECRET = "test-only-secret-test-only-secret-0000";
const systemBinary = (() => {
  try {
    return execFileSync("which", ["mongod"]).toString().trim() || undefined;
  } catch {
    return undefined;
  }
})();
const mongod = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" }, binary: systemBinary ? { systemBinary } : undefined });
process.env.MONGODB_URI = mongod.getUri();
after(async () => {
  await closeDb();
  await mongod.stop();
});

const { backupLines, closeDb, db, isDemo, nextId, resetDbForTests, setSetting, tx } = await import("../src/lib/db");
const L = await import("../src/lib/ledger");
const E = await import("../src/lib/engage");
const A = await import("../src/lib/accounts");
const { auth } = await import("../src/lib/auth");
const { addMonths, currentMonth, todayIST } = await import("../src/lib/time");
const P = await import("../src/lib/photos");

const NOW = currentMonth();
const PREV = addMonths(NOW, -1);
const PREV2 = addMonths(NOW, -2);
const NEXT = addMonths(NOW, 1);
const FEE = 50_000;
let admin = 0;
let phoneSeq = 0;

async function newMember(start = PREV2) {
  const id = await A.registerMember({ name: "Test Member", phone: `98${String(++phoneSeq).padStart(8, "0")}`, password: "password123", language: "en" });
  await L.approveMember(id, { billingStartMonth: start, actorId: admin });
  return id;
}
const bal = (id: number) => L.balanceOf(id);
const paymentsCount = async (id: number) => (await db()).payments.count({ member_id: id });

/** A signed-in browser: the request headers carrying the session cookie Better Auth set. */
async function signedIn(phone: string, password: string) {
  const { headers } = await auth().api.signInEmail({ body: { email: A.authEmail(`+91${phone}`), password }, returnHeaders: true });
  return new Headers({ cookie: headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
}

beforeEach(async () => {
  await resetDbForTests();
  const d = await db();
  await setSetting("launch_month", PREV2);
  await d.fee_schedule.insertOne({ _id: PREV2, amount_paise: FEE, created_at: new Date().toISOString() });
  // The admin only acts in these tests (never signs in), so no password is needed.
  admin = await nextId("users");
  await d.users.insertOne({ _id: new ObjectId(), uid: admin, name: "Admin", email: "admin@phone.vihan", phone: "+919999999999", role: "admin", status: "approved", language: "en", createdAt: new Date() });
});

describe("monthly billing", () => {
  test("approval bills from the start month; repeating the job creates no duplicates", async () => {
    const id = await newMember();
    assert.equal((await L.chargesFor(id)).length, 3);
    assert.equal(await L.generateCharges(), 0);
    assert.equal(await L.generateCharges(), 0);
    assert.equal((await L.chargesFor(id)).length, 3);
    assert.equal((await bal(id)).outstanding, 3 * FEE);
  });

  test("the database itself rejects a second charge for the same month", async () => {
    const id = await newMember();
    const dup = { _id: 9999, member_id: id, kind: "monthly" as const, period_month: NOW, amount_paise: 1, due_date: "2026-01-01", description: null, created_by: null, created_at: "x" };
    await assert.rejects((await db()).charges.insertOne(dup), /E11000/);
  });

  test("nothing is billed before the launch month, older dues only via confirmed opening balance", async () => {
    const uid = await A.registerMember({ name: "Old Timer", phone: "9876500001", password: "password123", language: "mr" });
    await L.approveMember(uid, { billingStartMonth: addMonths(NOW, -6), openingDues: { amount: 120_000, note: "Notebook balance" }, actorId: admin });
    const charges = await L.chargesFor(uid);
    assert.equal(charges.filter((c) => c.kind === "monthly").length, 3); // launch month onwards only
    assert.equal(charges.filter((c) => c.kind === "opening").length, 1);
    assert.equal((await bal(uid)).outstanding, 3 * FEE + 120_000);
  });

  test("a fee change applies to new months only and never rewrites history", async () => {
    const id = await newMember();
    await (await db()).fee_schedule.insertOne({ _id: NEXT, amount_paise: 60_000, created_at: "x" });
    await L.generateCharges({ upto: NEXT });
    const byMonth = Object.fromEntries((await L.chargesFor(id)).map((c) => [c.period_month, c.amount_paise]));
    assert.equal(byMonth[PREV2], FEE);
    assert.equal(byMonth[NOW], FEE);
    assert.equal(byMonth[NEXT], 60_000);
  });

  test("outstanding vs overdue follow the configured due day", async () => {
    await setSetting("due_day", "10");
    const id = await newMember(NOW);
    const due = (await L.chargesFor(id))[0].due_date;
    assert.equal(due, `${NOW}-10`);
    assert.equal((await L.balanceOf(id, `${NOW}-09`)).overdue, 0);
    assert.equal((await L.balanceOf(id, `${NOW}-11`)).overdue, FEE);
  });
});

describe("payments", () => {
  test("partial payment leaves the rest outstanding", async () => {
    const id = await newMember(NOW);
    await L.recordPayment({ memberId: id, amount: 20_000, paidOn: todayIST(), method: "cash", actorId: admin });
    assert.equal((await bal(id)).outstanding, 30_000);
  });

  test("multi-month payment clears the oldest charges first", async () => {
    const id = await newMember();
    await L.recordPayment({ memberId: id, amount: 2 * FEE, paidOn: todayIST(), method: "upi", actorId: admin });
    const open = await L.openCharges(id);
    assert.equal(open.length, 1);
    assert.equal(open[0].month, NOW);
  });

  test("advance payment covers upcoming months without creating overdue balances", async () => {
    const id = await newMember(NOW);
    await L.recordPayment({ memberId: id, amount: 3 * FEE, paidOn: todayIST(), method: "cash", actorId: admin });
    assert.deepEqual((await bal(id)), { outstanding: 0, overdue: 0, credit: 0, pendingClaims: 0, pendingClaimAmount: 0 });
    assert.equal(await L.generateCharges({ upto: addMonths(NOW, 2) }), 0); // already billed & paid
    assert.equal((await L.chargesFor(id)).length, 3);
  });

  test("an odd remainder stays as credit and is applied when the next month is billed", async () => {
    const id = await newMember(NOW);
    await L.recordPayment({ memberId: id, amount: FEE + 20_000, paidOn: todayIST(), method: "cash", actorId: admin });
    assert.equal((await bal(id)).credit, 20_000);
    await L.generateCharges({ upto: NEXT });
    assert.equal((await bal(id)).credit, 0);
    assert.equal((await bal(id)).outstanding, 30_000);
  });

  test("admin override pays a chosen month; invalid splits are refused", async () => {
    const id = await newMember();
    const nowCharge = (await L.openCharges(id)).find((c) => c.month === NOW)!;
    await L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", lines: [{ chargeId: nowCharge.id, month: NOW, amount: FEE }], actorId: admin });
    assert.deepEqual((await L.openCharges(id)).map((c) => c.month), [PREV2, PREV]);
    await assert.rejects(
      async () => L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", lines: [{ chargeId: nowCharge.id, month: NOW, amount: 1 }], actorId: admin }),
      /allocationTooMuch/,
    );
    const prev = (await L.openCharges(id))[0];
    await assert.rejects(
      async () => L.recordPayment({ memberId: id, amount: 100, paidOn: todayIST(), method: "cash", lines: [{ chargeId: prev.id, month: prev.month, amount: 200 }], actorId: admin }),
      /allocation/,
    );
  });

  test("a repeated submit (same idempotency key) records one payment", async () => {
    const id = await newMember(NOW);
    const a = await L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", idempotencyKey: "k1", actorId: admin });
    const b = await L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", idempotencyKey: "k1", actorId: admin });
    assert.equal(a.paymentId, b.paymentId);
    assert.equal(b.duplicate, true);
    assert.equal((await paymentsCount(id)), 1);
  });

  test("future-dated or zero payments are refused", async () => {
    const id = await newMember(NOW);
    await assert.rejects(async () => L.recordPayment({ memberId: id, amount: 0, paidOn: todayIST(), method: "cash", actorId: admin }), /amountInvalid/);
    await assert.rejects(async () => L.recordPayment({ memberId: id, amount: FEE, paidOn: "2999-01-01", method: "cash", actorId: admin }), /dateInvalid/);
  });

  test("reversal keeps the record, restores the balance and is audited", async () => {
    const id = await newMember(NOW);
    const { paymentId } = await L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", actorId: admin });
    await assert.rejects(async () => L.reversePayment(paymentId, "  ", admin), /reasonRequired/);
    await L.reversePayment(paymentId, "Recorded for wrong member", admin);
    assert.equal((await bal(id)).outstanding, FEE);
    assert.equal((await paymentsCount(id)), 1);
    assert.ok(await (await db()).audit.findOne({ action: "payment.reversed", entity_id: paymentId }));
    await assert.rejects(async () => L.reversePayment(paymentId, "again", admin), /paymentNotFound/);
  });

  test("waiver needs a reason and can be undone", async () => {
    const id = await newMember(NOW);
    const c = (await L.openCharges(id))[0];
    await L.waiveCharge(c.id, 10_000, "Festival discount", admin);
    assert.equal((await bal(id)).outstanding, 40_000);
    const w = (await (await db()).waivers.findOne({ charge_id: c.id }))!;
    await L.reverseWaiver(w._id, "Entered by mistake", admin);
    assert.equal((await bal(id)).outstanding, FEE);
  });
});

describe("payment claims", () => {
  test("a claim never reduces the balance until confirmed, and can't be confirmed twice", async () => {
    const id = await newMember(NOW);
    const claim = await L.submitClaim(id, { amount: FEE, paidOn: todayIST(), method: "upi", reference: "UPI123" });
    assert.equal((await bal(id)).outstanding, FEE);
    assert.equal((await bal(id)).pendingClaims, 1);
    await L.confirmClaim(claim, admin);
    assert.equal((await bal(id)).outstanding, 0);
    await assert.rejects(async () => L.confirmClaim(claim, admin), /claimAlreadyReviewed/);
    await assert.rejects(async () => L.rejectClaim(claim, "x", admin), /claimAlreadyReviewed/);
    assert.equal((await paymentsCount(id)), 1);
  });

  test("linking a claim to an already recorded payment does not double count", async () => {
    const id = await newMember();
    const { paymentId } = await L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", actorId: admin });
    const before = (await bal(id)).outstanding;
    const c1 = await L.submitClaim(id, { amount: FEE, paidOn: todayIST(), method: "cash" });
    assert.deepEqual((await L.linkablePayments(id)).map((p) => p.id), [paymentId]);
    await L.linkClaim(c1, paymentId, admin);
    assert.equal((await bal(id)).outstanding, before);
    assert.equal((await paymentsCount(id)), 1);
    const c2 = await L.submitClaim(id, { amount: FEE, paidOn: todayIST(), method: "cash" });
    await assert.rejects(async () => L.linkClaim(c2, paymentId, admin), /paymentNotLinkable/);
  });

  test("a claim can't be linked to another member's payment", async () => {
    const a = await newMember();
    const b = await newMember();
    const { paymentId } = await L.recordPayment({ memberId: b, amount: FEE, paidOn: todayIST(), method: "cash", actorId: admin });
    const c = await L.submitClaim(a, { amount: FEE, paidOn: todayIST(), method: "cash" });
    await assert.rejects(async () => L.linkClaim(c, paymentId, admin), /paymentNotLinkable/);
  });

  test("rejecting needs a reason; reversing a confirmed claim's payment flips the claim", async () => {
    const id = await newMember(NOW);
    const c = await L.submitClaim(id, { amount: FEE, paidOn: todayIST(), method: "upi" });
    await assert.rejects(async () => L.rejectClaim(c, "", admin), /reasonRequired/);
    const pid = await L.confirmClaim(c, admin);
    await L.reversePayment(pid, "UPI never arrived", admin);
    assert.equal((await (await db()).claims.findOne({ _id: c }))!.status, "rejected");
    assert.equal((await bal(id)).outstanding, FEE);
  });
});

describe("membership status", () => {
  test("pausing stops future charges, cancels unpaid ones from that month and keeps older dues", async () => {
    const id = await newMember(); // PREV2, PREV, NOW billed
    assert.deepEqual((await L.chargesAffectedByStop(id, NOW)).map((c) => c.period_month), [NOW]);
    await L.setMemberStatus(id, "paused", NOW, "Travelling", admin);
    assert.equal((await bal(id)).outstanding, 2 * FEE); // PREV2 + PREV still owed
    assert.equal(await L.generateCharges({ upto: addMonths(NOW, 3) }), 0);
    assert.equal(await L.statusAt(id, NEXT), "paused");
  });

  test("resuming re-instates the month and bills again", async () => {
    const id = await newMember();
    await L.setMemberStatus(id, "paused", NOW, null, admin);
    await L.setMemberStatus(id, "active", NOW, "Back", admin);
    assert.equal((await bal(id)).outstanding, 3 * FEE);
    await L.generateCharges({ upto: NEXT });
    assert.equal((await bal(id)).outstanding, 4 * FEE);
  });

  test("a member who left is never billed again and history stays", async () => {
    const id = await newMember();
    await L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", actorId: admin });
    await L.setMemberStatus(id, "left", NEXT, "Moved away", admin);
    await L.generateCharges({ upto: addMonths(NOW, 4) });
    assert.equal((await L.chargesFor(id)).length, 3);
    assert.equal((await bal(id)).outstanding, 2 * FEE);
  });

  test("status can't take effect before billing started", async () => {
    const id = await newMember(NOW);
    await assert.rejects(async () => L.setMemberStatus(id, "paused", PREV, null, admin), /monthBeforeStart/);
  });
});

describe("attendance & goals", () => {
  test("one recorded visit per Asia/Kolkata day; attendance never touches fees", async () => {
    const id = await newMember(NOW);
    const t = new Date();
    assert.equal((await E.checkIn(id, "qr", t)).created, true);
    assert.equal((await E.checkIn(id, "app", t)).created, false);
    assert.equal((await E.visitDates(id, NOW)).length, 1);
    assert.equal((await bal(id)).outstanding, FEE);
  });

  test("the day boundary is midnight IST, not UTC", async () => {
    assert.equal(todayIST(new Date("2026-10-24T18:29:00Z")), "2026-10-24");
    assert.equal(todayIST(new Date("2026-10-24T18:31:00Z")), "2026-10-25");
  });

  test("paused members can't check in", async () => {
    const id = await newMember();
    await L.setMemberStatus(id, "paused", NOW, null, admin);
    await assert.rejects(async () => E.checkIn(id, "app"), /checkinNotActive/);
  });

  test("goal carries over and progress comes from recorded visits", async () => {
    const id = await newMember(NOW);
    assert.deepEqual(await E.goalFor(id), { target: 12, chosen: false });
    await E.setGoal(id, 8);
    assert.deepEqual(await E.goalFor(id, addMonths(NOW, 2)), { target: 8, chosen: true });
    await assert.rejects(async () => E.setGoal(id, 99), /goalInvalid/);
  });

  test("follow-up list skips opted-out, paused and recently prompted members", async () => {
    const quiet = await newMember();
    const optedOut = await newMember();
    const paused = await newMember();
    await (await db()).users.updateOne({ uid: optedOut }, { $set: { followup_opt_in: 0 } });
    await L.setMemberStatus(paused, "paused", NOW, null, admin);
    await (await db()).users.updateMany({}, { $set: { reviewed_at: "2020-01-01T00:00:00Z" } });
    let ids = (await E.followUpCandidates()).map((f) => f.id);
    assert.deepEqual(ids, [quiet]);
    await E.logReminderOpen(quiet, "attendance", "en", admin);
    ids = (await E.followUpCandidates()).map((f) => f.id);
    assert.deepEqual(ids, []);
  });
});

describe("accounts", () => {
  test("phone numbers are normalised so the same number can't register twice", async () => {
    await A.registerMember({ name: "Ravi", phone: "98765 43210", password: "password123", language: "en" });
    await assert.rejects(A.registerMember({ name: "Ravi again", phone: "+91-9876543210", password: "password123", language: "en" }), /phoneTaken/);
    await assert.rejects(A.registerMember({ name: "Short", phone: "12345", password: "password123", language: "en" }), /phoneInvalid/);
  });

  test("passwords are hashed, never stored as typed", async () => {
    const id = await A.registerMember({ name: "Hash Check", phone: "9000000001", password: "secretpass1", language: "hi" });
    const d = await db();
    const user = (await d.users.findOne({ uid: id }))!;
    const account = (await d.accounts.findOne({ userId: user._id, providerId: "credential" }))!;
    assert.match(account.password as string, /^[0-9a-f]+:[0-9a-f]+$/); // Better Auth's scrypt salt:hash
    assert.ok(!(account.password as string).includes("secretpass1"));
    assert.equal(JSON.stringify(user).includes("secretpass1"), false);
    assert.equal((await A.authenticate("9000000001", "secretpass1", "t")).id, id);
    await assert.rejects(A.authenticate("9000000001", "wrong-pass", "t"), /badCredentials/);
  });

  test("login is rate limited per phone", async () => {
    await A.registerMember({ name: "Limit", phone: "9000000002", password: "secretpass1", language: "en" });
    for (let i = 0; i < 6; i++) await assert.rejects(A.authenticate("9000000002", "nope-nope", "ip"), /badCredentials/);
    await assert.rejects(A.authenticate("9000000002", "secretpass1", "ip"), /tooManyAttempts/);
  });

  test("pending registrations can't be billed or approved twice", async () => {
    const id = await A.registerMember({ name: "Pending", phone: "9000000003", password: "secretpass1", language: "en" });
    assert.equal(await L.generateCharges(), 0);
    await assert.rejects(async () => L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", actorId: admin }), /memberNotFound/);
    await L.approveMember(id, { billingStartMonth: NOW, actorId: admin });
    await assert.rejects(async () => L.approveMember(id, { billingStartMonth: NOW, actorId: admin }), /registrationNotPending/);
  });

  test("reset codes are single-use, expire, and lock after 5 wrong tries", async () => {
    const id = await A.registerMember({ name: "Forgetful", phone: "9000000004", password: "secretpass1", language: "en" });
    const { code } = await A.issueResetCode(id, admin);
    await assert.rejects(A.redeemResetCode("9000000004", "WRONGCODE", "newpassword1", "ip"), /resetCodeInvalid/);
    await A.redeemResetCode("9000000004", code.toLowerCase(), "newpassword1", "ip");
    await assert.rejects(A.redeemResetCode("9000000004", code, "another-pass1", "ip"), /resetCodeInvalid/);
    assert.equal((await A.authenticate("9000000004", "newpassword1", "ip2")).id, id);

    const second = (await A.issueResetCode(id, admin)).code;
    for (let i = 0; i < 5; i++) await assert.rejects(A.redeemResetCode("9000000004", "BADBADBA", "newpassword2", "ip3"), /resetCodeInvalid/);
    await assert.rejects(A.redeemResetCode("9000000004", second, "newpassword2", "ip3"), /resetCodeInvalid/);
  });

  test("a session cookie resolves to its user, can't be forged and dies on logout", async () => {
    const id = await A.registerMember({ name: "Session", phone: "9000000005", password: "secretpass1", language: "en" });
    const h = await signedIn("9000000005", "secretpass1");
    assert.deepEqual(await A.userForHeaders(h), { id, name: "Session", phone: "+919000000005", role: "member", status: "pending", language: "en" });
    assert.equal(await A.userForHeaders(new Headers({ cookie: h.get("cookie")!.replace(/=(.)/, "=x$1") })), null);
    await A.signOut(h);
    assert.equal(await A.userForHeaders(h), null);
  });
});

describe("bug bash regressions", () => {
  test("reversing an advance payment removes the months it pre-created", async () => {
    const id = await newMember(NOW);
    const { paymentId } = await L.recordPayment({ memberId: id, amount: 3 * FEE, paidOn: todayIST(), method: "cash", actorId: admin });
    assert.equal((await L.chargesFor(id)).length, 3);
    await L.reversePayment(paymentId, "Wrong member", admin);
    assert.equal((await bal(id)).outstanding, FEE); // only this month is owed
    assert.deepEqual((await L.chargesFor(id)).map((c) => c.period_month), [NOW]);
  });

  test("refunding a prepaid member who left doesn't create dues for months after leaving", async () => {
    const id = await newMember(NOW);
    const { paymentId } = await L.recordPayment({ memberId: id, amount: 3 * FEE, paidOn: todayIST(), method: "cash", actorId: admin });
    await L.setMemberStatus(id, "left", NEXT, "Moved", admin);
    await L.reversePayment(paymentId, "Refunded", admin);
    assert.equal((await bal(id)).outstanding, FEE);
  });

  test("a back-dated resume doesn't un-waive months that are still paused", async () => {
    const id = await newMember(); // PREV2..NOW billed
    await L.setMemberStatus(id, "paused", NOW, null, admin);
    await L.setMemberStatus(id, "active", PREV, "correction", admin); // older row; NOW is still governed by the pause
    assert.equal(await L.statusAt(id, NOW), "paused");
    assert.equal((await bal(id)).outstanding, 2 * FEE);
  });

  test("re-entering an older pause doesn't waive a month that is active", async () => {
    const id = await newMember();
    await L.setMemberStatus(id, "paused", PREV, null, admin);
    await L.setMemberStatus(id, "active", NOW, null, admin);
    await L.setMemberStatus(id, "paused", PREV, "re-entered", admin); // same older pause again
    assert.equal(await L.statusAt(id, NOW), "active");
    assert.equal((await bal(id)).outstanding, 2 * FEE); // PREV2 owed (before pause) + NOW owed (active); PREV waived
  });

  test("the verified opening balance is paid before monthly charges", async () => {
    const uid = await A.registerMember({ name: "Opening", phone: "9876500002", password: "password123", language: "en" });
    await L.approveMember(uid, { billingStartMonth: PREV2, openingDues: { amount: 120_000, note: "Notebook" }, actorId: admin });
    await L.recordPayment({ memberId: uid, amount: 120_000, paidOn: todayIST(), method: "cash", actorId: admin });
    const opening = (await L.chargesFor(uid)).find((c) => c.kind === "opening")!;
    assert.equal(opening.outstanding, 0);
    assert.equal((await bal(uid)).outstanding, 3 * FEE);
  });

  test("upcoming months in a custom split must be whole; leftover settles the oldest charge", async () => {
    const id = await newMember();
    const future = (await L.unbilledMonths(id))[0];
    await assert.rejects(
      async () => L.recordPayment({ memberId: id, amount: 10_000, paidOn: todayIST(), method: "cash", lines: [{ month: future.month, amount: 10_000 }], actorId: admin }),
      /allocationWholeMonths/,
    );
    const nowCharge = (await L.openCharges(id)).find((c) => c.month === NOW)!;
    await L.recordPayment({ memberId: id, amount: 2 * FEE, paidOn: todayIST(), method: "cash", lines: [{ chargeId: nowCharge.id, month: NOW, amount: FEE }], actorId: admin });
    assert.equal((await bal(id)).credit, 0); // the unsplit ₹500 went to the oldest month instead of idling as credit
    assert.deepEqual((await L.openCharges(id)).map((c) => c.month), [PREV]);
  });

  test("a claim can't be linked to a payment of a different amount", async () => {
    const id = await newMember();
    const { paymentId } = await L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", actorId: admin });
    const c = await L.submitClaim(id, { amount: 3 * FEE, paidOn: todayIST(), method: "upi" });
    await assert.rejects(async () => L.linkClaim(c, paymentId, admin), /claimAmountMismatch/);
  });

  test("an idempotency key can't return another member's payment", async () => {
    const a = await newMember(NOW);
    const b = await newMember(NOW);
    await L.recordPayment({ memberId: a, amount: 100, paidOn: todayIST(), method: "cash", idempotencyKey: "shared", actorId: admin });
    await assert.rejects(async () => L.recordPayment({ memberId: b, amount: FEE, paidOn: todayIST(), method: "cash", idempotencyKey: "shared", actorId: admin }), /invalidInput/);
  });

  test("dates that don't exist are refused", async () => {
    const id = await newMember(NOW);
    await assert.rejects(async () => L.submitClaim(id, { amount: FEE, paidOn: "2026-02-30", method: "upi" }), /dateInvalid/);
    await assert.rejects(async () => E.adminSetVisit(id, "2026-02-30", true, "x", admin), /dateInvalid/);
  });

  test("a member whose billing starts next month can still check in", async () => {
    const uid = await A.registerMember({ name: "Starts Later", phone: "9876500003", password: "password123", language: "en" });
    await L.approveMember(uid, { billingStartMonth: NEXT, actorId: admin });
    assert.equal((await E.checkIn(uid, "app")).created, true);
    assert.equal((await bal(uid)).outstanding, 0);
  });

  test("launch month: moving earlier extends the fee, moving past existing charges is refused", async () => {
    const id = await newMember(); // charges from PREV2
    await assert.rejects(async () => L.setBillingSettings(NOW, 10, admin), /launchHasCharges/);
    await L.setBillingSettings(addMonths(PREV2, -1), 10, admin);
    assert.equal(await L.feeFor(addMonths(PREV2, -1)), FEE);
    void id;
  });
});

describe("security regressions", () => {
  test("changing the password signs out every other session", async () => {
    const id = await A.registerMember({ name: "Sessions", phone: "9000000006", password: "secretpass1", language: "en" });
    const laptop = await signedIn("9000000006", "secretpass1");
    const phone = await signedIn("9000000006", "secretpass1");
    await assert.rejects(A.changePassword(id, "wrong-current", "secretpass2", phone), /badCurrentPassword/);
    await A.changePassword(id, "secretpass1", "secretpass2", phone);
    assert.equal(await A.userForHeaders(laptop), null);
    assert.equal((await A.authenticate("9000000006", "secretpass2", "ip")).id, id);
  });

  test("a stranger's failed guesses don't lock the owner out from another place", async () => {
    await A.registerMember({ name: "Owner", phone: "9000000007", password: "secretpass1", language: "en" });
    for (let i = 0; i < 6; i++) await assert.rejects(A.authenticate("9000000007", "nope-nope", "attacker"), /badCredentials/);
    await assert.rejects(A.authenticate("9000000007", "secretpass1", "attacker"), /tooManyAttempts/);
    assert.ok(await A.authenticate("9000000007", "secretpass1", "owner-phone"));
  });

  test("a rejected registration loses its session and the number can register again", async () => {
    const id = await A.registerMember({ name: "Someone Else", phone: "9000000008", password: "secretpass1", language: "en" });
    const h = await signedIn("9000000008", "secretpass1");
    await L.rejectRegistration(id, "Not our member", admin);
    assert.equal(await A.userForHeaders(h), null);
    await assert.rejects(A.authenticate("9000000008", "secretpass1", "ip"), /accountRejected/); // right password, still refused
    await assert.rejects(A.authenticate("9000000008", "wrong-pass1", "ip"), /badCredentials/); // and it doesn't say so to a guesser
    const again = await A.registerMember({ name: "Real Owner", phone: "9000000008", password: "secretpass9", language: "mr" });
    assert.equal(again, id);
    const u = (await (await db()).users.findOne({ uid: id }))!;
    assert.deepEqual({ status: u.status, name: u.name }, { status: "pending", name: "Real Owner" });
    assert.equal((await A.authenticate("9000000008", "secretpass9", "ip2")).id, id);
  });

  test("reset codes can't be issued for the admin account", async () => {
    await assert.rejects(async () => A.issueResetCode(admin, admin), /memberNotFound/);
  });

  test("a fresh database already has a check-in key", async () => {
    assert.ok((await (await db()).settings.findOne({ _id: "checkin_key" }))!.value.length >= 10);
  });

  test("demo-only sign-in is refused outside demo mode", async () => {
    assert.equal(isDemo(), false);
    await assert.rejects(A.signInDemo("+919000000010", new Headers()), /demoOnly/);
  });
});

describe("photos", () => {
  test("Cloudinary signature matches the documented example", async () => {
    const params = { timestamp: 1315060510, public_id: "sample_image", eager: "w_400,h_300,c_pad|w_260,h_200,c_crop" };
    assert.equal(P.cloudinarySignature(params, "abcd"), "bfd09f95f331f558cbd1320e67aa8d488770583e");
  });

  test("a non-image is refused before anything is sent to Cloudinary", async () => {
    process.env.CLOUDINARY_URL = "cloudinary://key:secret@cloud";
    const id = await newMember();
    await assert.rejects(P.setMemberPhoto(id, new File(["x"], "a.txt", { type: "text/plain" }), admin), { code: "photoInvalid" });
    await assert.rejects(P.setMemberPhoto(admin, new File(["x"], "a.jpg", { type: "image/jpeg" }), admin), { code: "memberNotFound" });
    delete process.env.CLOUDINARY_URL;
  });
});

describe("hosted database: requests really run in parallel", () => {
  test("two parallel saves with one idempotency key record one payment", async () => {
    const id = await newMember(NOW);
    const save = () => L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", idempotencyKey: "double-tap", actorId: admin });
    const [a, b] = await Promise.all([save(), save()]);
    assert.equal(a.paymentId, b.paymentId);
    assert.equal(await paymentsCount(id), 1);
    assert.equal((await bal(id)).outstanding, 0);
  });

  test("one reset code redeemed twice at the same moment works once", async () => {
    const id = await A.registerMember({ name: "Racer", phone: "9000000077", password: "secretpass1", language: "en" });
    const { code } = await A.issueResetCode(id, admin);
    const results = await Promise.allSettled([A.redeemResetCode("9000000077", code, "first-pass-1", "ip"), A.redeemResetCode("9000000077", code, "second-pass-1", "ip")]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  });

  test("overlapping billing runs create each month once", async () => {
    const id = await newMember();
    await L.setMemberStatus(id, "paused", NOW, null, admin);
    await L.setMemberStatus(id, "active", NEXT, null, admin);
    const before = (await L.chargesFor(id)).length;
    await Promise.all([L.generateCharges({ upto: addMonths(NOW, 3) }), L.generateCharges({ upto: addMonths(NOW, 3) })]);
    assert.equal((await L.chargesFor(id)).length, before + 3);
  });

  test("a failed step rolls back the whole transaction", async () => {
    const id = await newMember(NOW);
    await assert.rejects(
      tx(async () => {
        await L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", actorId: admin });
        throw new Error("boom");
      }),
      /boom/,
    );
    assert.equal(await paymentsCount(id), 0);
  });

  test("the backup holds every record with its types intact", async () => {
    const id = await newMember();
    await L.recordPayment({ memberId: id, amount: FEE + 123, paidOn: todayIST(), method: "upi", reference: "it's \"quoted\"", actorId: admin });
    const rows: { c: string; d: Record<string, unknown> }[] = [];
    for await (const line of backupLines()) rows.push(BSON.EJSON.parse(line, { relaxed: false }) as { c: string; d: Record<string, unknown> });
    const d = await db();
    for (const name of ["payments", "charges", "allocations", "users", "accounts", "counters"] as const)
      assert.equal(rows.filter((r) => r.c === name).length, await d[name].count(), name);
    const exact = (x: unknown) => BSON.EJSON.stringify(x, { relaxed: false }); // number types included
    assert.equal(exact(rows.find((r) => r.c === "payments")!.d), exact(await d.payments.findOne({})));
    assert.ok(rows.find((r) => r.c === "users" && Number(r.d.uid) === id)!.d.createdAt instanceof Date);
    assert.equal(rows.some((r) => r.c === "sessions"), false); // sign-in sessions are not kept
  });

  test("a payment and a waiver racing on one charge never cover it twice", async () => {
    const id = await newMember(NOW);
    const c = (await L.openCharges(id))[0];
    await Promise.allSettled([
      L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", lines: [{ chargeId: c.id, month: NOW, amount: FEE }], actorId: admin }),
      L.waiveCharge(c.id, FEE, "Festival offer", admin),
    ]);
    const after = (await L.chargesFor(id)).find((x) => x.id === c.id)!;
    assert.equal(after.paid_paise + after.waived_paise, FEE);
    assert.equal(after.outstanding, 0);
  });

  test("one payment can't be linked to two claims at the same moment", async () => {
    const id = await newMember();
    const { paymentId } = await L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", actorId: admin });
    const c1 = await L.submitClaim(id, { amount: FEE, paidOn: todayIST(), method: "cash" });
    const c2 = await L.submitClaim(id, { amount: FEE, paidOn: todayIST(), method: "cash" });
    const results = await Promise.allSettled([L.linkClaim(c1, paymentId, admin), L.linkClaim(c2, paymentId, admin), L.linkClaim(c1, paymentId, admin)]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await (await db()).claims.count({ payment_id: paymentId }), 1);
  });

  test("a pause racing the billing run never leaves a paused month owed", async () => {
    const id = await newMember(); // PREV2..NOW billed
    await Promise.all([L.setMemberStatus(id, "paused", NOW, null, admin), L.generateCharges({ upto: NEXT })]);
    assert.equal((await bal(id)).outstanding, 2 * FEE); // PREV2 + PREV; NOW (and NEXT, if billed first) waived
  });

  test("payments without a key and several pending claims don't collide in the unique indexes", async () => {
    const id = await newMember();
    await L.recordPayment({ memberId: id, amount: 100, paidOn: todayIST(), method: "cash", actorId: admin });
    await L.recordPayment({ memberId: id, amount: 100, paidOn: todayIST(), method: "cash", actorId: admin });
    await L.submitClaim(id, { amount: 100, paidOn: todayIST(), method: "upi" });
    await L.submitClaim(id, { amount: 100, paidOn: todayIST(), method: "upi" });
    assert.equal(await paymentsCount(id), 2);
    assert.equal((await bal(id)).pendingClaims, 2);
  });
});
