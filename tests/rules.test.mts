// Business-rule tests against a fresh in-memory database.
// Run: npm test
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

process.env.APP_MODE = "test";
process.env.DATABASE_PATH = ":memory:";

const { db, resetDbForTests, setSetting } = await import("../src/lib/db");
const L = await import("../src/lib/ledger");
const E = await import("../src/lib/engage");
const A = await import("../src/lib/accounts");
const { addMonths, currentMonth, todayIST } = await import("../src/lib/time");

const NOW = currentMonth();
const PREV = addMonths(NOW, -1);
const PREV2 = addMonths(NOW, -2);
const NEXT = addMonths(NOW, 1);
const FEE = 50_000;
let admin = 0;
let phoneSeq = 0;

async function newMember(start = PREV2) {
  const id = await A.registerMember({ name: "Test Member", phone: `98${String(++phoneSeq).padStart(8, "0")}`, password: "password123", language: "en" });
  L.approveMember(id, { billingStartMonth: start, actorId: admin });
  return id;
}
const bal = (id: number) => L.balanceOf(id);
const paymentsCount = (id: number) => (db().prepare("SELECT COUNT(*) n FROM payments WHERE member_id = ?").get(id) as { n: number }).n;

beforeEach(async () => {
  resetDbForTests();
  setSetting("launch_month", PREV2);
  db().prepare("INSERT INTO fee_schedule (effective_month, amount_paise, created_at) VALUES (?, ?, ?)").run(PREV2, FEE, new Date().toISOString());
  admin = Number(
    db()
      .prepare("INSERT INTO users (phone, name, password_hash, role, status, created_at) VALUES ('+919999999999', 'Admin', 'x', 'admin', 'approved', ?)")
      .run(new Date().toISOString()).lastInsertRowid,
  );
});

describe("monthly billing", () => {
  test("approval bills from the start month; repeating the job creates no duplicates", async () => {
    const id = await newMember();
    assert.equal(L.chargesFor(id).length, 3);
    assert.equal(L.generateCharges(), 0);
    assert.equal(L.generateCharges(), 0);
    assert.equal(L.chargesFor(id).length, 3);
    assert.equal(bal(id).outstanding, 3 * FEE);
  });

  test("the database itself rejects a second charge for the same month", async () => {
    const id = await newMember();
    assert.throws(() =>
      db().prepare("INSERT INTO charges (member_id, kind, period_month, amount_paise, due_date, created_at) VALUES (?, 'monthly', ?, 1, '2026-01-01', 'x')").run(id, NOW),
    );
  });

  test("nothing is billed before the launch month, older dues only via confirmed opening balance", async () => {
    const uid = await A.registerMember({ name: "Old Timer", phone: "9876500001", password: "password123", language: "mr" });
    L.approveMember(uid, { billingStartMonth: addMonths(NOW, -6), openingDues: { amount: 120_000, note: "Notebook balance" }, actorId: admin });
    const charges = L.chargesFor(uid);
    assert.equal(charges.filter((c) => c.kind === "monthly").length, 3); // launch month onwards only
    assert.equal(charges.filter((c) => c.kind === "opening").length, 1);
    assert.equal(bal(uid).outstanding, 3 * FEE + 120_000);
  });

  test("a fee change applies to new months only and never rewrites history", async () => {
    const id = await newMember();
    db().prepare("INSERT INTO fee_schedule (effective_month, amount_paise, created_at) VALUES (?, 60000, 'x')").run(NEXT);
    L.generateCharges({ upto: NEXT });
    const byMonth = Object.fromEntries(L.chargesFor(id).map((c) => [c.period_month, c.amount_paise]));
    assert.equal(byMonth[PREV2], FEE);
    assert.equal(byMonth[NOW], FEE);
    assert.equal(byMonth[NEXT], 60_000);
  });

  test("outstanding vs overdue follow the configured due day", async () => {
    setSetting("due_day", "10");
    const id = await newMember(NOW);
    const due = L.chargesFor(id)[0].due_date;
    assert.equal(due, `${NOW}-10`);
    assert.equal(L.balanceOf(id, `${NOW}-09`).overdue, 0);
    assert.equal(L.balanceOf(id, `${NOW}-11`).overdue, FEE);
  });
});

describe("payments", () => {
  test("partial payment leaves the rest outstanding", async () => {
    const id = await newMember(NOW);
    L.recordPayment({ memberId: id, amount: 20_000, paidOn: todayIST(), method: "cash", actorId: admin });
    assert.equal(bal(id).outstanding, 30_000);
  });

  test("multi-month payment clears the oldest charges first", async () => {
    const id = await newMember();
    L.recordPayment({ memberId: id, amount: 2 * FEE, paidOn: todayIST(), method: "upi", actorId: admin });
    const open = L.openCharges(id);
    assert.equal(open.length, 1);
    assert.equal(open[0].month, NOW);
  });

  test("advance payment covers upcoming months without creating overdue balances", async () => {
    const id = await newMember(NOW);
    L.recordPayment({ memberId: id, amount: 3 * FEE, paidOn: todayIST(), method: "cash", actorId: admin });
    assert.deepEqual(bal(id), { outstanding: 0, overdue: 0, credit: 0, pendingClaims: 0, pendingClaimAmount: 0 });
    assert.equal(L.generateCharges({ upto: addMonths(NOW, 2) }), 0); // already billed & paid
    assert.equal(L.chargesFor(id).length, 3);
  });

  test("an odd remainder stays as credit and is applied when the next month is billed", async () => {
    const id = await newMember(NOW);
    L.recordPayment({ memberId: id, amount: FEE + 20_000, paidOn: todayIST(), method: "cash", actorId: admin });
    assert.equal(bal(id).credit, 20_000);
    L.generateCharges({ upto: NEXT });
    assert.equal(bal(id).credit, 0);
    assert.equal(bal(id).outstanding, 30_000);
  });

  test("admin override pays a chosen month; invalid splits are refused", async () => {
    const id = await newMember();
    const nowCharge = L.openCharges(id).find((c) => c.month === NOW)!;
    L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", lines: [{ chargeId: nowCharge.id, month: NOW, amount: FEE }], actorId: admin });
    assert.deepEqual(L.openCharges(id).map((c) => c.month), [PREV2, PREV]);
    assert.throws(
      () => L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", lines: [{ chargeId: nowCharge.id, month: NOW, amount: 1 }], actorId: admin }),
      /allocationTooMuch/,
    );
    const prev = L.openCharges(id)[0];
    assert.throws(
      () => L.recordPayment({ memberId: id, amount: 100, paidOn: todayIST(), method: "cash", lines: [{ chargeId: prev.id, month: prev.month, amount: 200 }], actorId: admin }),
      /allocation/,
    );
  });

  test("a repeated submit (same idempotency key) records one payment", async () => {
    const id = await newMember(NOW);
    const a = L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", idempotencyKey: "k1", actorId: admin });
    const b = L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", idempotencyKey: "k1", actorId: admin });
    assert.equal(a.paymentId, b.paymentId);
    assert.equal(b.duplicate, true);
    assert.equal(paymentsCount(id), 1);
  });

  test("future-dated or zero payments are refused", async () => {
    const id = await newMember(NOW);
    assert.throws(() => L.recordPayment({ memberId: id, amount: 0, paidOn: todayIST(), method: "cash", actorId: admin }), /amountInvalid/);
    assert.throws(() => L.recordPayment({ memberId: id, amount: FEE, paidOn: "2999-01-01", method: "cash", actorId: admin }), /dateInvalid/);
  });

  test("reversal keeps the record, restores the balance and is audited", async () => {
    const id = await newMember(NOW);
    const { paymentId } = L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", actorId: admin });
    assert.throws(() => L.reversePayment(paymentId, "  ", admin), /reasonRequired/);
    L.reversePayment(paymentId, "Recorded for wrong member", admin);
    assert.equal(bal(id).outstanding, FEE);
    assert.equal(paymentsCount(id), 1);
    assert.ok(db().prepare("SELECT 1 FROM audit WHERE action = 'payment.reversed' AND entity_id = ?").get(paymentId));
    assert.throws(() => L.reversePayment(paymentId, "again", admin), /paymentNotFound/);
  });

  test("waiver needs a reason and can be undone", async () => {
    const id = await newMember(NOW);
    const c = L.openCharges(id)[0];
    L.waiveCharge(c.id, 10_000, "Festival discount", admin);
    assert.equal(bal(id).outstanding, 40_000);
    const w = db().prepare("SELECT id FROM waivers WHERE charge_id = ?").get(c.id) as { id: number };
    L.reverseWaiver(w.id, "Entered by mistake", admin);
    assert.equal(bal(id).outstanding, FEE);
  });
});

describe("payment claims", () => {
  test("a claim never reduces the balance until confirmed, and can't be confirmed twice", async () => {
    const id = await newMember(NOW);
    const claim = L.submitClaim(id, { amount: FEE, paidOn: todayIST(), method: "upi", reference: "UPI123" });
    assert.equal(bal(id).outstanding, FEE);
    assert.equal(bal(id).pendingClaims, 1);
    L.confirmClaim(claim, admin);
    assert.equal(bal(id).outstanding, 0);
    assert.throws(() => L.confirmClaim(claim, admin), /claimAlreadyReviewed/);
    assert.throws(() => L.rejectClaim(claim, "x", admin), /claimAlreadyReviewed/);
    assert.equal(paymentsCount(id), 1);
  });

  test("linking a claim to an already recorded payment does not double count", async () => {
    const id = await newMember();
    const { paymentId } = L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", actorId: admin });
    const before = bal(id).outstanding;
    const c1 = L.submitClaim(id, { amount: FEE, paidOn: todayIST(), method: "cash" });
    assert.deepEqual(L.linkablePayments(id).map((p) => p.id), [paymentId]);
    L.linkClaim(c1, paymentId, admin);
    assert.equal(bal(id).outstanding, before);
    assert.equal(paymentsCount(id), 1);
    const c2 = L.submitClaim(id, { amount: FEE, paidOn: todayIST(), method: "cash" });
    assert.throws(() => L.linkClaim(c2, paymentId, admin), /paymentNotLinkable/);
  });

  test("a claim can't be linked to another member's payment", async () => {
    const a = await newMember();
    const b = await newMember();
    const { paymentId } = L.recordPayment({ memberId: b, amount: FEE, paidOn: todayIST(), method: "cash", actorId: admin });
    const c = L.submitClaim(a, { amount: FEE, paidOn: todayIST(), method: "cash" });
    assert.throws(() => L.linkClaim(c, paymentId, admin), /paymentNotLinkable/);
  });

  test("rejecting needs a reason; reversing a confirmed claim's payment flips the claim", async () => {
    const id = await newMember(NOW);
    const c = L.submitClaim(id, { amount: FEE, paidOn: todayIST(), method: "upi" });
    assert.throws(() => L.rejectClaim(c, "", admin), /reasonRequired/);
    const pid = L.confirmClaim(c, admin);
    L.reversePayment(pid, "UPI never arrived", admin);
    const row = db().prepare("SELECT status FROM claims WHERE id = ?").get(c) as { status: string };
    assert.equal(row.status, "rejected");
    assert.equal(bal(id).outstanding, FEE);
  });
});

describe("membership status", () => {
  test("pausing stops future charges, cancels unpaid ones from that month and keeps older dues", async () => {
    const id = await newMember(); // PREV2, PREV, NOW billed
    assert.deepEqual(L.chargesAffectedByStop(id, NOW).map((c) => c.period_month), [NOW]);
    L.setMemberStatus(id, "paused", NOW, "Travelling", admin);
    assert.equal(bal(id).outstanding, 2 * FEE); // PREV2 + PREV still owed
    assert.equal(L.generateCharges({ upto: addMonths(NOW, 3) }), 0);
    assert.equal(L.statusAt(id, NEXT), "paused");
  });

  test("resuming re-instates the month and bills again", async () => {
    const id = await newMember();
    L.setMemberStatus(id, "paused", NOW, null, admin);
    L.setMemberStatus(id, "active", NOW, "Back", admin);
    assert.equal(bal(id).outstanding, 3 * FEE);
    L.generateCharges({ upto: NEXT });
    assert.equal(bal(id).outstanding, 4 * FEE);
  });

  test("a member who left is never billed again and history stays", async () => {
    const id = await newMember();
    L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", actorId: admin });
    L.setMemberStatus(id, "left", NEXT, "Moved away", admin);
    L.generateCharges({ upto: addMonths(NOW, 4) });
    assert.equal(L.chargesFor(id).length, 3);
    assert.equal(bal(id).outstanding, 2 * FEE);
  });

  test("status can't take effect before billing started", async () => {
    const id = await newMember(NOW);
    assert.throws(() => L.setMemberStatus(id, "paused", PREV, null, admin), /monthBeforeStart/);
  });
});

describe("attendance & goals", () => {
  test("one recorded visit per Asia/Kolkata day; attendance never touches fees", async () => {
    const id = await newMember(NOW);
    const t = new Date();
    assert.equal(E.checkIn(id, "qr", t).created, true);
    assert.equal(E.checkIn(id, "app", t).created, false);
    assert.equal(E.visitDates(id, NOW).length, 1);
    assert.equal(bal(id).outstanding, FEE);
  });

  test("the day boundary is midnight IST, not UTC", () => {
    assert.equal(todayIST(new Date("2026-10-24T18:29:00Z")), "2026-10-24");
    assert.equal(todayIST(new Date("2026-10-24T18:31:00Z")), "2026-10-25");
  });

  test("paused members can't check in", async () => {
    const id = await newMember();
    L.setMemberStatus(id, "paused", NOW, null, admin);
    assert.throws(() => E.checkIn(id, "app"), /checkinNotActive/);
  });

  test("goal carries over and progress comes from recorded visits", async () => {
    const id = await newMember(NOW);
    assert.deepEqual(E.goalFor(id), { target: 12, chosen: false });
    E.setGoal(id, 8);
    assert.deepEqual(E.goalFor(id, addMonths(NOW, 2)), { target: 8, chosen: true });
    assert.throws(() => E.setGoal(id, 99), /goalInvalid/);
  });

  test("follow-up list skips opted-out, paused and recently prompted members", async () => {
    const quiet = await newMember();
    const optedOut = await newMember();
    const paused = await newMember();
    db().prepare("UPDATE members SET followup_opt_in = 0 WHERE user_id = ?").run(optedOut);
    L.setMemberStatus(paused, "paused", NOW, null, admin);
    db().prepare("UPDATE users SET reviewed_at = '2020-01-01T00:00:00Z'").run();
    let ids = E.followUpCandidates().map((f) => f.id);
    assert.deepEqual(ids, [quiet]);
    E.logReminderOpen(quiet, "attendance", "en", admin);
    ids = E.followUpCandidates().map((f) => f.id);
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
    const row = db().prepare("SELECT password_hash FROM users WHERE id = ?").get(id) as { password_hash: string };
    assert.ok(row.password_hash.startsWith("scrypt$"));
    assert.ok(!row.password_hash.includes("secretpass1"));
    assert.equal(await A.authenticate("9000000001", "secretpass1", "t"), id);
    await assert.rejects(A.authenticate("9000000001", "wrong-pass", "t"), /badCredentials/);
  });

  test("login is rate limited per phone", async () => {
    await A.registerMember({ name: "Limit", phone: "9000000002", password: "secretpass1", language: "en" });
    for (let i = 0; i < 6; i++) await assert.rejects(A.authenticate("9000000002", "nope-nope", "ip"), /badCredentials/);
    await assert.rejects(A.authenticate("9000000002", "secretpass1", "ip"), /tooManyAttempts/);
  });

  test("pending registrations can't be billed or approved twice", async () => {
    const id = await A.registerMember({ name: "Pending", phone: "9000000003", password: "secretpass1", language: "en" });
    assert.equal(L.generateCharges(), 0);
    assert.throws(() => L.recordPayment({ memberId: id, amount: FEE, paidOn: todayIST(), method: "cash", actorId: admin }), /memberNotFound/);
    L.approveMember(id, { billingStartMonth: NOW, actorId: admin });
    assert.throws(() => L.approveMember(id, { billingStartMonth: NOW, actorId: admin }), /registrationNotPending/);
  });

  test("reset codes are single-use, expire, and lock after 5 wrong tries", async () => {
    const id = await A.registerMember({ name: "Forgetful", phone: "9000000004", password: "secretpass1", language: "en" });
    const { code } = A.issueResetCode(id, admin);
    await assert.rejects(A.redeemResetCode("9000000004", "WRONGCODE", "newpassword1", "ip"), /resetCodeInvalid/);
    await A.redeemResetCode("9000000004", code.toLowerCase(), "newpassword1", "ip");
    await assert.rejects(A.redeemResetCode("9000000004", code, "another-pass1", "ip"), /resetCodeInvalid/);
    assert.equal(await A.authenticate("9000000004", "newpassword1", "ip2"), id);

    const second = A.issueResetCode(id, admin).code;
    for (let i = 0; i < 5; i++) await assert.rejects(A.redeemResetCode("9000000004", "BADBADBA", "newpassword2", "ip3"), /resetCodeInvalid/);
    await assert.rejects(A.redeemResetCode("9000000004", second, "newpassword2", "ip3"), /resetCodeInvalid/);
  });

  test("a session token resolves to its user and dies on logout", async () => {
    const id = await A.registerMember({ name: "Session", phone: "9000000005", password: "secretpass1", language: "en" });
    const { token } = A.createSession(id);
    assert.equal(A.userForToken(token)?.status, "pending");
    assert.equal(A.userForToken(token + "x"), null);
    A.destroySession(token);
    assert.equal(A.userForToken(token), null);
  });
});
