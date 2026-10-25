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
const Q = await import("../src/lib/queries");
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
    assert.deepEqual((await bal(id)), { outstanding: 0, overdue: 0, credit: 0, pendingClaims: 0, pendingClaimAmount: 0, toPay: 0 });
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

  test("undoing an admin waiver on a paused month keeps the month waived", async () => {
    const id = await newMember(NOW);
    const c = (await L.openCharges(id))[0];
    await L.waiveCharge(c.id, 10_000, "Discount", admin);
    await L.setMemberStatus(id, "paused", NOW, null, admin);
    assert.equal((await bal(id)).outstanding, 0);
    const w = (await (await db()).waivers.findOne({ charge_id: c.id, source: "admin" }))!;
    await L.reverseWaiver(w._id, "Entered by mistake", admin);
    assert.equal((await bal(id)).outstanding, 0);
  });

  test("a status waiver can't be undone by hand; it follows the membership status", async () => {
    const id = await newMember(NOW);
    await L.setMemberStatus(id, "paused", NOW, null, admin);
    const w = (await (await db()).waivers.findOne({ member_id: id, source: "status" }))!;
    await assert.rejects(async () => L.reverseWaiver(w._id, "Trying", admin), /waiverNotFound/);
    assert.equal((await bal(id)).outstanding, 0);
  });

  test("the amount still to pay leaves out money already claimed", async () => {
    const id = await newMember(PREV);
    await L.submitClaim(id, { amount: FEE, paidOn: todayIST(), method: "upi" });
    const b = await bal(id);
    assert.equal(b.outstanding, 2 * FEE);
    assert.equal(b.toPay, FEE);
    await L.submitClaim(id, { amount: 2 * FEE, paidOn: todayIST(), method: "upi" });
    assert.equal((await bal(id)).toPay, 0);
  });

  test("screen versions of open charges, upcoming months and linkable payments match the ledger's", async () => {
    const id = await newMember(PREV);
    const other = await newMember(PREV);
    const { paymentId } = await L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", actorId: admin });
    await L.recordPayment({ memberId: other, amount: FEE, paidOn: todayIST(), method: "cash", actorId: admin });
    await L.setMemberStatus(id, "paused", addMonths(NOW, 2), null, admin);
    const linked = await L.submitClaim(id, { amount: FEE, paidOn: todayIST(), method: "cash" });
    const { paymentId: second } = await L.recordPayment({ memberId: id, amount: 2 * FEE, paidOn: todayIST(), method: "upi", actorId: admin });
    await L.linkClaim(linked, paymentId, admin);
    assert.deepEqual(await Q.openChargesOf(id), await L.openCharges(id));
    assert.deepEqual(await Q.unbilledMonthsOf(id), await L.unbilledMonths(id));
    assert.deepEqual(await Q.linkablePaymentsOf(id), await L.linkablePayments(id));
    assert.deepEqual((await L.linkablePayments(id)).map((p) => p.id), [second]);
  });

  test("too-large amounts say what's wrong instead of 'enter more than ₹0'", async () => {
    const id = await newMember(NOW);
    const c = (await L.openCharges(id))[0];
    await assert.rejects(async () => L.waiveCharge(c.id, FEE + 100, "Too much", admin), /amountOverDue/);
    await assert.rejects(async () => L.waiveCharge(c.id, 0, "Nothing", admin), /amountInvalid/);
    await assert.rejects(async () => L.recordPayment({ memberId: id, amount: L.MAX_PAYMENT_PAISE + 1, paidOn: todayIST(), method: "cash", actorId: admin }), /amountTooLarge/);
  });

  test("a payment saved while a backup runs is in it whole or not at all", async () => {
    const id = await newMember(NOW);
    const lines = backupLines();
    await lines.next(); // the backup has started reading
    const { paymentId } = await L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", actorId: admin });
    const rows: { c: string; d: Record<string, unknown> }[] = [];
    for await (const line of lines) rows.push(BSON.EJSON.parse(line, { relaxed: false }) as { c: string; d: Record<string, unknown> });
    assert.equal(rows.some((r) => r.c === "payments" && Number(r.d._id) === paymentId), false);
    assert.equal(rows.some((r) => r.c === "allocations" && Number(r.d.payment_id) === paymentId), false);
    const counter = rows.find((r) => r.c === "counters" && r.d._id === "payments");
    assert.ok(!counter || Number(counter.d.seq) < paymentId);
  });
});

describe("security regressions", () => {
  test("post-login redirects stay on this site", () => {
    for (const bad of ["//evil.example", "/.//evil.example/login", "/..//evil.example", "/a/..//evil.example", "/%2e//evil.example", "/\\evil.example", "/\t/evil.example", "https://evil.example"])
      assert.equal(A.safeNext(bad), null, bad);
    assert.equal(A.safeNext("/checkin?k=abc"), "/checkin?k=abc");
  });

  test("rate limits count an IPv6 client by its /64, so hopping addresses doesn't reset them", () => {
    assert.equal(A.ipKey("2405:201:abcd:12:1111:2222:3333:4444"), A.ipKey("2405:201:ABCD:12::9"));
    assert.notEqual(A.ipKey("2405:201:abcd:12::1"), A.ipKey("2405:201:abcd:13::1"));
    assert.equal(A.ipKey("::ffff:10.0.0.1"), "10.0.0.1");
    assert.equal(A.ipKey("203.0.113.7"), "203.0.113.7");
  });

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

describe("admin-editable site", async () => {
  const S = await import("../src/lib/site");
  const C = await import("../src/lib/site-config");
  const I = await import("../src/lib/i18n");
  const { settingsByPrefix } = await import("../src/lib/db");

  /** A form as an admin page submits it: every field of that page, with `over` replacing some. */
  async function pageForm(page: "brand" | "contact" | "messages" | "rules", over: Record<string, string | string[]> = {}) {
    const { fields, texts } = await S.pageValues(page);
    const fd = new FormData();
    const put = (k: string, v: string | string[]) => (Array.isArray(v) ? v.forEach((x) => fd.append(k, x)) : fd.set(k, v));
    for (const [id, v] of Object.entries(fields)) {
      const f = C.FIELDS[id as keyof typeof C.FIELDS] as { type: string };
      if (typeof v === "object") for (const l of I.LANGS) put(`f.${id}.${l}`, v[l]);
      else put(`f.${id}`, f.type === "multi" ? v.split(",").filter(Boolean) : v);
    }
    for (const [k, v] of Object.entries(texts)) for (const l of I.LANGS) put(`t.${l}.${k}`, v[l]);
    for (const [k, v] of Object.entries(over)) {
      fd.delete(k);
      put(k, v);
    }
    return fd;
  }
  const tFor = async (lang: "en" | "mr" | "hi") => {
    const site = await S.getSite(lang);
    return I.makeT(lang, { vars: site.vars, overrides: site.overrides });
  };

  test("out of the box everything reads exactly as it did before (names, rules, texts)", async () => {
    assert.deepEqual((await S.getSite("en")).vars, { gym: "Vihan Fitness", gymShort: "Vihan", owner: "Bharat sir", ownerName: "Bharat Gite", town: "Nagothane" });
    assert.equal((await S.getSite("mr")).vars.owner, "भरत सर");
    const r = await S.getRules();
    assert.deepEqual([r.goalOptions, r.defaultGoal, r.maxClaims, r.maxHelp, r.backOnTrack, r.methods, r.upiId], [[4, 8, 12, 16, 20], 12, 5, 3, 6, ["cash", "upi", "other"], ""]);
    assert.deepEqual(r.checklist.map((i) => i.key), ["meet", "goals", "equipment", "routine", "firstWeek"]);
    assert.equal((await tFor("en"))("auth.registerTitle"), "Join Vihan Fitness");
    assert.equal((await tFor("mr"))("errors.accountRejected"), "ही नोंदणी मंजूर झाली नाही. कृपया भरत सर यांच्याशी बोला.");
  });

  test("a rename reaches every text in every language; blank Marathi/Hindi fall back to English", async () => {
    await S.savePage("brand", await pageForm("brand", { "f.gymName.en": "Power House", "f.gymName.mr": "", "f.gymName.hi": "पावर हाउस", "f.owner.en": "Ravi sir", "f.owner.mr": "रवी सर" }));
    assert.equal((await tFor("en"))("auth.registerTitle"), "Join Power House");
    assert.equal((await tFor("mr"))("publicSite.footer"), "Power House · नागोठणे"); // blank Marathi name → English
    assert.equal((await tFor("hi"))("publicSite.footer"), "पावर हाउस · नागोठणे");
    assert.match((await tFor("mr"))("errors.accountRejected"), /रवी सर यांच्याशी/);
  });

  test("a wording edit must keep its {placeholders}; saving the original text removes the edit", async () => {
    assert.throws(() => S.cleanText("en", "whatsapp.templates.fee", "Hi {name}, please pay."), { code: "placeholdersChanged" });
    assert.throws(() => S.cleanText("en", "whatsapp.templates.fee", "Hi {name} {amount} {months} {amout}"), { code: "placeholdersChanged" });
    // Brand names may be added or dropped freely.
    assert.equal(S.cleanText("en", "whatsapp.templates.attendance", "Hey {name}! Miss you at {gym}."), "Hey {name}! Miss you at {gym}.");
    await assert.rejects(S.savePage("messages", await pageForm("messages", { "t.mr.whatsapp.templates.receipt": "पावती" })), { code: "placeholdersChanged", field: "t.mr.whatsapp.templates.receipt" });

    const fd = new FormData();
    fd.set("t.en.publicSite.heroTop", "Lift heavy.");
    fd.set("t.mr.publicSite.heroTop", C.defaultText("mr", "publicSite.heroTop")!);
    fd.set("t.hi.publicSite.heroTop", "");
    await S.saveText("publicSite.heroTop", fd);
    assert.equal((await tFor("en"))("publicSite.heroTop"), "Lift heavy.");
    assert.equal((await tFor("mr"))("publicSite.heroTop"), C.defaultText("mr", "publicSite.heroTop")); // each language keeps its own text
    fd.set("t.en.publicSite.heroTop", C.defaultText("en", "publicSite.heroTop")!);
    await S.saveText("publicSite.heroTop", fd);
    assert.equal((await settingsByPrefix(["text."])).size, 0);
    assert.throws(() => S.cleanText("en", "no.such.key", "x"), { code: "invalidInput" });
  });

  test("goal choices: the default must be one of them, and removed choices can't be picked", async () => {
    await assert.rejects(S.savePage("rules", await pageForm("rules", { "f.goalOptions": "8, 16", "f.defaultGoal": "12" })), { code: "defaultGoalMissing" });
    await assert.rejects(S.savePage("rules", await pageForm("rules", { "f.goalOptions": "8" })), { code: "goalListInvalid" });
    await S.savePage("rules", await pageForm("rules", { "f.goalOptions": "16 8", "f.defaultGoal": "8" }));
    assert.deepEqual((await S.getRules()).goalOptions, [8, 16]);
    const id = await newMember(NOW);
    assert.equal((await E.goalFor(id)).target, 8);
    await assert.rejects(E.setGoal(id, 12), { code: "goalInvalid" });
    await E.setGoal(id, 16);
  });

  test("a removed checklist item stays ticked in old records but can't be ticked again", async () => {
    const id = await newMember(NOW);
    await E.toggleOnboarding(id, "meet", true, admin);
    const items = [{ key: "goals", label: {} }, { key: "", label: { en: "Diet chat", mr: "आहार चर्चा" } }];
    await S.savePage("rules", await pageForm("rules", { "f.checklist": JSON.stringify(items) }));
    const list = (await S.getRules()).checklist;
    assert.deepEqual(list.map((i) => i.key)[0], "goals");
    assert.match(list[1].key, /^c[0-9a-f]{8}$/);
    assert.ok((await E.onboardingDone(id)).has("meet"));
    await assert.rejects(E.toggleOnboarding(id, "meet", true, admin), { code: "invalidInput" });
    await E.toggleOnboarding(id, list[1].key, true, admin);
    assert.equal(C.checklistLabel(list[1], "hi", (k) => k), "Diet chat"); // no Hindi label → English
    await assert.rejects(S.savePage("rules", await pageForm("rules", { "f.checklist": JSON.stringify([{ key: "", label: { mr: "फक्त मराठी" } }]) })), { code: "checklistInvalid" });
  });

  test("claim and help-request limits come from the settings", async () => {
    await S.savePage("rules", await pageForm("rules", { "f.maxClaims": "1", "f.maxHelp": "1" }));
    const id = await newMember(NOW);
    await L.submitClaim(id, { amount: FEE, paidOn: todayIST(), method: "upi" });
    await assert.rejects(L.submitClaim(id, { amount: FEE, paidOn: todayIST(), method: "upi" }), { code: "tooManyClaims" });
    await E.createHelpRequest(id, "routine", null);
    await assert.rejects(E.createHelpRequest(id, "general", null), { code: "tooManyHelpRequests" });
    await assert.rejects(S.savePage("rules", await pageForm("rules", { "f.maxClaims": "0" })), { code: "numberRange" });
    await assert.rejects(S.savePage("rules", await pageForm("rules", { "f.methods": [] })), { code: "methodsEmpty" });
  });

  test("UPI IDs and links are checked; the pay link carries the amount", async () => {
    await assert.rejects(S.savePage("rules", await pageForm("rules", { "f.upiId": "not a upi" })), { code: "upiInvalid" });
    await S.savePage("rules", await pageForm("rules", { "f.upiId": "bharat.gite@okhdfcbank", "f.upiName": "Bharat Gite" }));
    assert.equal((await S.getRules()).upiId, "bharat.gite@okhdfcbank");
    assert.equal(C.upiLink({ id: "a.b@okaxis", name: "Bharat Gite", rupees: 1000, note: "Fees" }), "upi://pay?pa=a.b%40okaxis&pn=Bharat%20Gite&am=1000.00&cu=INR&tn=Fees");
    for (const bad of ["http://instagram.com/x", "javascript:alert(1)", "instagram.com/x"])
      await assert.rejects(S.savePage("contact", await pageForm("contact", { "f.instagram": bad })), { code: "urlInvalid" });
    await S.savePage("contact", await pageForm("contact", { "f.instagram": "https://instagram.com/vihanfitness", "f.phone": "98200 12345 ext" }));
    const site = await S.getSite("en");
    assert.equal(site.social.instagram, "https://instagram.com/vihanfitness");
    assert.equal(site.info.phone, "98200 12345");
  });

  test("every accent preset keeps text readable (WCAG 4.5:1)", () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    for (const [name, a] of Object.entries(C.ACCENTS)) {
      assert.ok(ratio("#121210", a.volt) >= 4.5, `${name}: dark text on the accent`);
      assert.ok(ratio(a.ink, "#fffdf9") >= 4.5, `${name}: accent text on light surfaces`);
      assert.ok(ratio(a.ink, a.soft) >= 4.5, `${name}: accent text on its soft tint`);
    }
  });

  test("the dictionaries carry no hard-coded names, and every language uses the same placeholders", () => {
    const names = /Bharat|Vihan|Nagothane|Gite|भरत स|भरत \(|विहान|नागोठ|गिते/;
    for (const k of C.allTextKeys()) {
      if (k.startsWith("site.")) continue; // admin help may quote examples
      const sets = I.LANGS.map((l) => [...(I.lookup(I.DICTS[l], k) ?? "").matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join());
      assert.ok(sets.every((s) => s === sets[0]), `${k}: placeholders differ between languages (${sets.join(" | ")})`);
      for (const l of I.LANGS) assert.ok(!names.test(I.lookup(I.DICTS[l], k) ?? ""), `${l} ${k} still names the gym or owner`);
    }
  });
});

describe("UPI claim screenshots", () => {
  test("a screenshot is kept on UPI claims only, and never changes the balance", async () => {
    const id = await newMember(NOW);
    const url = "https://res.cloudinary.com/demo/image/upload/v1/vihan/test/claims/m1-abc.jpg";
    const upi = await L.submitClaim(id, { amount: FEE, paidOn: todayIST(), method: "upi", proof: url });
    const cash = await L.submitClaim(id, { amount: 100, paidOn: todayIST(), method: "cash", proof: url });
    const d = await db();
    assert.equal((await d.claims.findOne({ _id: upi }))?.proof, url);
    assert.equal((await d.claims.findOne({ _id: cash }))?.proof, null);
    assert.equal((await bal(id)).outstanding, FEE);
  });

  test("a screenshot that isn't an image is refused before anything is sent to Cloudinary", async () => {
    process.env.CLOUDINARY_URL = "cloudinary://key:secret@cloud";
    await assert.rejects(P.uploadClaimProof(1, new File(["x"], "a.pdf", { type: "application/pdf" })), { code: "photoInvalid" });
    await assert.rejects(P.uploadClaimProof(1, new File([], "empty.jpg", { type: "image/jpeg" })), { code: "photoInvalid" });
    await assert.rejects(P.uploadClaimProof(1, null), { code: "photoInvalid" });
    delete process.env.CLOUDINARY_URL;
  });
});
