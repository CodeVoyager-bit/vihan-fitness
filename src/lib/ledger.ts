import { AppError, audit, db, nowIso, setting, settingInt, tx } from "./db";
import { type OpenCharge, type FutureMonth, type PlanLine, planAllocation, validatePlan } from "./plan";
import { addMonths, currentMonth, dueDateFor, isDate, isMonth, monthsBetween, todayIST } from "./time";

export type MemberStatus = "active" | "paused" | "left";
export type Method = "cash" | "upi" | "other";
export const METHODS: Method[] = ["cash", "upi", "other"];
export const MAX_PAYMENT_PAISE = 5_000_000; // ₹50,000 sanity cap per entry

// ───────────────────────────── fees & status ─────────────────────────────

export function feeFor(month: string): number | null {
  const r = db()
    .prepare("SELECT amount_paise FROM fee_schedule WHERE effective_month <= ? ORDER BY effective_month DESC LIMIT 1")
    .get(month) as { amount_paise: number } | undefined;
  return r?.amount_paise ?? null;
}

export function statusAt(memberId: number, month: string): MemberStatus | null {
  const r = db()
    .prepare(
      "SELECT status FROM membership_status WHERE member_id = ? AND effective_month <= ? ORDER BY effective_month DESC, id DESC LIMIT 1",
    )
    .get(memberId, month) as { status: MemberStatus } | undefined;
  return r?.status ?? null;
}

function member(memberId: number) {
  const m = db()
    .prepare(
      "SELECT m.user_id AS id, m.billing_start_month FROM members m JOIN users u ON u.id = m.user_id WHERE m.user_id = ? AND u.status = 'approved'",
    )
    .get(memberId) as { id: number; billing_start_month: string } | undefined;
  if (!m) throw new AppError("memberNotFound");
  return m;
}

function firstBillableMonth(billingStart: string): string | null {
  const launch = setting("launch_month");
  if (!launch) return null;
  return billingStart > launch ? billingStart : launch;
}

// ───────────────────────────── charges ─────────────────────────────

const insertMonthly = () =>
  db().prepare(
    "INSERT OR IGNORE INTO charges (member_id, kind, period_month, amount_paise, due_date, created_at) VALUES (?, 'monthly', ?, ?, ?, ?)",
  );

/**
 * Creates the monthly charge for every eligible (approved, active that month, on/after launch & billing start)
 * member-month up to `upto`. Safe to run any number of times: a unique index makes repeats no-ops.
 */
export function generateCharges(opts: { upto?: string; memberId?: number } = {}): number {
  const upto = opts.upto ?? currentMonth();
  const dueDay = settingInt("due_day", 10);
  const rows = db()
    .prepare(
      `SELECT m.user_id AS id, m.billing_start_month FROM members m JOIN users u ON u.id = m.user_id
       WHERE u.status = 'approved' ${opts.memberId ? "AND m.user_id = ?" : ""}`,
    )
    .all(...(opts.memberId ? [opts.memberId] : [])) as { id: number; billing_start_month: string }[];

  let created = 0;
  tx(() => {
    const ins = insertMonthly();
    for (const m of rows) {
      const start = firstBillableMonth(m.billing_start_month);
      if (!start) continue;
      let touched = false;
      for (const month of monthsBetween(start, upto)) {
        if (statusAt(m.id, month) !== "active") continue;
        const fee = feeFor(month);
        if (!fee) continue;
        if (ins.run(m.id, month, fee, dueDateFor(month, dueDay), nowIso()).changes) {
          created++;
          touched = true;
        }
      }
      if (touched) settle(m.id);
    }
    if (created) audit(null, "billing.generated", { detail: { upto, created } });
  });
  return created;
}

const g = globalThis as unknown as { __vfBilledOn?: string };
/** Cheap daily catch-up so charges appear on the 1st without a cron job. */
export function ensureBillingCurrent() {
  const today = todayIST();
  if (g.__vfBilledOn === today) return;
  generateCharges();
  g.__vfBilledOn = today;
}
export const invalidateBillingCache = () => (g.__vfBilledOn = undefined);

export function addCharge(o: {
  memberId: number;
  kind: "opening" | "manual";
  amount: number;
  description: string;
  periodMonth?: string | null;
  actorId: number;
}) {
  if (!Number.isInteger(o.amount) || o.amount <= 0 || o.amount > MAX_PAYMENT_PAISE) throw new AppError("amountInvalid", "amount");
  if (!o.description.trim()) throw new AppError("reasonRequired", "description");
  if (o.periodMonth && !isMonth(o.periodMonth)) throw new AppError("monthInvalid", "periodMonth");
  return tx(() => {
    member(o.memberId);
    const r = db()
      .prepare(
        "INSERT INTO charges (member_id, kind, period_month, amount_paise, due_date, description, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(o.memberId, o.kind, o.periodMonth ?? null, o.amount, todayIST(), o.description.trim(), o.actorId, nowIso());
    audit(o.actorId, `charge.${o.kind}`, {
      memberId: o.memberId,
      entity: "charge",
      entityId: r.lastInsertRowid,
      detail: { amount: o.amount, description: o.description, periodMonth: o.periodMonth ?? null },
    });
    settle(o.memberId);
    return Number(r.lastInsertRowid);
  });
}

export type ChargeRow = {
  id: number;
  member_id: number;
  kind: "monthly" | "opening" | "manual";
  period_month: string | null;
  amount_paise: number;
  due_date: string;
  description: string | null;
  created_at: string;
  paid_paise: number;
  waived_paise: number;
  outstanding: number;
};

export function chargesFor(memberId: number): ChargeRow[] {
  return db()
    .prepare(
      `SELECT *, amount_paise - paid_paise - waived_paise AS outstanding FROM charge_balances
       WHERE member_id = ? ORDER BY due_date DESC, id DESC`,
    )
    .all(memberId) as ChargeRow[];
}

export function openCharges(memberId: number, today = todayIST()): OpenCharge[] {
  return (
    db()
      .prepare(
        `SELECT id, period_month, due_date, amount_paise - paid_paise - waived_paise AS outstanding FROM charge_balances
         WHERE member_id = ? AND amount_paise - paid_paise - waived_paise > 0
         ORDER BY due_date, COALESCE(period_month, ''), id`,
      )
      .all(memberId) as { id: number; period_month: string | null; due_date: string; outstanding: number }[]
  ).map((c) => ({ id: c.id, month: c.period_month, outstanding: c.outstanding, overdue: c.due_date < today }));
}

/** Upcoming months that have no charge yet but would be billed (used for advance payments). */
export function unbilledMonths(memberId: number, count = 12): FutureMonth[] {
  const m = member(memberId);
  const start = firstBillableMonth(m.billing_start_month);
  if (!start) return [];
  const now = currentMonth();
  const from = start > now ? start : now;
  const billed = new Set(
    (
      db().prepare("SELECT period_month FROM charges WHERE member_id = ? AND kind = 'monthly'").all(memberId) as {
        period_month: string;
      }[]
    ).map((r) => r.period_month),
  );
  const out: FutureMonth[] = [];
  for (const month of monthsBetween(from, addMonths(now, count))) {
    if (billed.has(month) || statusAt(memberId, month) !== "active") continue;
    const fee = feeFor(month);
    if (fee) out.push({ month, fee });
  }
  return out;
}

function ensureMonthlyCharge(memberId: number, month: string): number {
  insertMonthly().run(memberId, month, feeFor(month), dueDateFor(month, settingInt("due_day", 10)), nowIso());
  const r = db()
    .prepare("SELECT id FROM charges WHERE member_id = ? AND kind = 'monthly' AND period_month = ?")
    .get(memberId, month) as { id: number };
  return r.id;
}

// ───────────────────────────── credit settlement ─────────────────────────────

const upsertAllocation = () =>
  db().prepare(
    `INSERT INTO allocations (payment_id, charge_id, amount_paise, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(payment_id, charge_id) DO UPDATE SET amount_paise = amount_paise + excluded.amount_paise`,
  );

/** Applies any unallocated (advance) money to unpaid charges, oldest first. */
export function settle(memberId: number) {
  const credits = db()
    .prepare(
      `SELECT id, unallocated_paise AS left FROM payment_balances
       WHERE member_id = ? AND reversed_at IS NULL AND unallocated_paise > 0 ORDER BY paid_on, id`,
    )
    .all(memberId) as { id: number; left: number }[];
  if (!credits.length) return;
  const charges = openCharges(memberId);
  const up = upsertAllocation();
  for (const c of charges) {
    let need = c.outstanding;
    for (const p of credits) {
      if (need <= 0) break;
      if (p.left <= 0) continue;
      const take = Math.min(need, p.left);
      up.run(p.id, c.id, take, nowIso());
      p.left -= take;
      need -= take;
    }
  }
}

// ───────────────────────────── payments ─────────────────────────────

export type RecordPaymentInput = {
  memberId: number;
  amount: number;
  paidOn: string;
  method: Method;
  reference?: string | null;
  note?: string | null;
  lines?: PlanLine[] | null; // admin override; omitted = default oldest-first plan
  idempotencyKey?: string | null;
  actorId: number;
};

function checkPaymentFields(amount: number, paidOn: string, method: string) {
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_PAYMENT_PAISE) throw new AppError("amountInvalid", "amount");
  if (!isDate(paidOn) || paidOn > todayIST() || paidOn < "2020-01-01") throw new AppError("dateInvalid", "paidOn");
  if (!METHODS.includes(method as Method)) throw new AppError("methodInvalid", "method");
}

/** Records money Bharat received outside the app. Atomic; a repeated idempotency key returns the first payment. */
export function recordPayment(i: RecordPaymentInput): { paymentId: number; duplicate: boolean } {
  checkPaymentFields(i.amount, i.paidOn, i.method);
  return tx(() => {
    if (i.idempotencyKey) {
      const prev = db().prepare("SELECT id FROM payments WHERE idempotency_key = ?").get(i.idempotencyKey) as
        | { id: number }
        | undefined;
      if (prev) return { paymentId: prev.id, duplicate: true };
    }
    member(i.memberId);
    const open = openCharges(i.memberId);
    const future = unbilledMonths(i.memberId);
    let lines: PlanLine[];
    if (i.lines) {
      const err = validatePlan(i.amount, i.lines, open, future);
      if (err) throw new AppError(err);
      lines = i.lines;
    } else lines = planAllocation(i.amount, open, future).lines;

    const r = db()
      .prepare(
        `INSERT INTO payments (member_id, amount_paise, paid_on, method, reference, note, idempotency_key, recorded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(i.memberId, i.amount, i.paidOn, i.method, clean(i.reference), clean(i.note), i.idempotencyKey ?? null, i.actorId, nowIso());
    const paymentId = Number(r.lastInsertRowid);
    const up = upsertAllocation();
    for (const l of lines) up.run(paymentId, l.chargeId ?? ensureMonthlyCharge(i.memberId, l.month!), l.amount, nowIso());
    audit(i.actorId, "payment.recorded", {
      memberId: i.memberId,
      entity: "payment",
      entityId: paymentId,
      detail: { amount: i.amount, method: i.method, paidOn: i.paidOn, lines },
    });
    return { paymentId, duplicate: false };
  });
}

/** Corrections never delete: the payment stays on record, marked reversed, and stops counting. */
export function reversePayment(paymentId: number, reason: string, actorId: number) {
  if (!reason.trim()) throw new AppError("reasonRequired", "reason");
  tx(() => {
    const p = db().prepare("SELECT member_id, amount_paise FROM payments WHERE id = ? AND reversed_at IS NULL").get(paymentId) as
      | { member_id: number; amount_paise: number }
      | undefined;
    if (!p) throw new AppError("paymentNotFound");
    db()
      .prepare("UPDATE payments SET reversed_at = ?, reversed_by = ?, reversal_reason = ? WHERE id = ?")
      .run(nowIso(), actorId, reason.trim(), paymentId);
    // A confirmed claim backed by this payment is no longer true.
    db()
      .prepare("UPDATE claims SET status = 'rejected', reject_reason = ?, reviewed_by = ?, reviewed_at = ? WHERE payment_id = ?")
      .run(`Payment reversed: ${reason.trim()}`, actorId, nowIso(), paymentId);
    audit(actorId, "payment.reversed", {
      memberId: p.member_id,
      entity: "payment",
      entityId: paymentId,
      detail: { amount: p.amount_paise, reason: reason.trim() },
    });
    settle(p.member_id);
  });
}

export function waiveCharge(chargeId: number, amount: number, reason: string, actorId: number | null, source: "admin" | "status" = "admin") {
  if (!reason.trim()) throw new AppError("reasonRequired", "reason");
  tx(() => {
    const c = db()
      .prepare("SELECT member_id, amount_paise - paid_paise - waived_paise AS outstanding FROM charge_balances WHERE id = ?")
      .get(chargeId) as { member_id: number; outstanding: number } | undefined;
    if (!c) throw new AppError("chargeNotFound");
    if (!Number.isInteger(amount) || amount <= 0 || amount > c.outstanding) throw new AppError("amountInvalid", "amount");
    const r = db()
      .prepare("INSERT INTO waivers (charge_id, amount_paise, reason, source, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(chargeId, amount, reason.trim(), source, actorId, nowIso());
    audit(actorId, "charge.waived", {
      memberId: c.member_id,
      entity: "waiver",
      entityId: r.lastInsertRowid,
      detail: { chargeId, amount, reason: reason.trim(), source },
    });
  });
}

export function reverseWaiver(waiverId: number, reason: string, actorId: number) {
  if (!reason.trim()) throw new AppError("reasonRequired", "reason");
  tx(() => {
    const w = db()
      .prepare("SELECT w.charge_id, c.member_id FROM waivers w JOIN charges c ON c.id = w.charge_id WHERE w.id = ? AND w.reversed_at IS NULL")
      .get(waiverId) as { charge_id: number; member_id: number } | undefined;
    if (!w) throw new AppError("waiverNotFound");
    db().prepare("UPDATE waivers SET reversed_at = ?, reversed_by = ?, reversal_reason = ? WHERE id = ?").run(nowIso(), actorId, reason.trim(), waiverId);
    audit(actorId, "waiver.reversed", { memberId: w.member_id, entity: "waiver", entityId: waiverId, detail: { reason: reason.trim() } });
    settle(w.member_id);
  });
}

// ───────────────────────────── membership status ─────────────────────────────

/** Unpaid monthly charges that a pause/leave from `fromMonth` would cancel (anything already paid is kept). */
export function chargesAffectedByStop(memberId: number, fromMonth: string) {
  return db()
    .prepare(
      `SELECT id, period_month, paid_paise, amount_paise - paid_paise - waived_paise AS outstanding FROM charge_balances
       WHERE member_id = ? AND kind = 'monthly' AND period_month >= ? AND amount_paise - paid_paise - waived_paise > 0
       ORDER BY period_month`,
    )
    .all(memberId, fromMonth) as { id: number; period_month: string; paid_paise: number; outstanding: number }[];
}

export function setMemberStatus(memberId: number, status: MemberStatus, effectiveMonth: string, reason: string | null, actorId: number) {
  if (!["active", "paused", "left"].includes(status)) throw new AppError("statusInvalid");
  if (!isMonth(effectiveMonth)) throw new AppError("monthInvalid", "effectiveMonth");
  tx(() => {
    const m = member(memberId);
    if (effectiveMonth < m.billing_start_month) throw new AppError("monthBeforeStart", "effectiveMonth");
    db()
      .prepare("INSERT INTO membership_status (member_id, status, effective_month, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(memberId, status, effectiveMonth, clean(reason), actorId, nowIso());
    if (status === "active") {
      // Undo the automatic waivers a previous pause/leave created for these months.
      const auto = db()
        .prepare(
          `SELECT w.id FROM waivers w JOIN charges c ON c.id = w.charge_id
           WHERE c.member_id = ? AND c.kind = 'monthly' AND c.period_month >= ? AND w.source = 'status' AND w.reversed_at IS NULL`,
        )
        .all(memberId, effectiveMonth) as { id: number }[];
      for (const w of auto)
        db().prepare("UPDATE waivers SET reversed_at = ?, reversed_by = ?, reversal_reason = ? WHERE id = ?").run(nowIso(), actorId, `status:active:${effectiveMonth}`, w.id);
      generateCharges({ memberId });
      settle(memberId);
    } else {
      for (const c of chargesAffectedByStop(memberId, effectiveMonth))
        waiveCharge(c.id, c.outstanding, `status:${status}:${effectiveMonth}`, actorId, "status");
    }
    audit(actorId, "member.status", { memberId, detail: { status, effectiveMonth, reason: clean(reason) } });
  });
}

// ───────────────────────────── claims ─────────────────────────────

export function submitClaim(
  memberId: number,
  c: { amount: number; paidOn: string; method: Method; reference?: string | null; note?: string | null },
) {
  checkPaymentFields(c.amount, c.paidOn, c.method);
  return tx(() => {
    member(memberId);
    const pending = db().prepare("SELECT COUNT(*) AS n FROM claims WHERE member_id = ? AND status = 'pending'").get(memberId) as { n: number };
    if (pending.n >= 5) throw new AppError("tooManyClaims");
    const r = db()
      .prepare("INSERT INTO claims (member_id, amount_paise, paid_on, method, reference, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(memberId, c.amount, c.paidOn, c.method, clean(c.reference), clean(c.note), nowIso());
    audit(memberId, "claim.submitted", { memberId, entity: "claim", entityId: r.lastInsertRowid, detail: { amount: c.amount } });
    return Number(r.lastInsertRowid);
  });
}

type ClaimRow = { id: number; member_id: number; amount_paise: number; paid_on: string; method: Method; reference: string | null; note: string | null; status: string };

function pendingClaim(claimId: number): ClaimRow {
  const c = db().prepare("SELECT * FROM claims WHERE id = ?").get(claimId) as ClaimRow | undefined;
  if (!c) throw new AppError("claimNotFound");
  if (c.status !== "pending") throw new AppError("claimAlreadyReviewed");
  return c;
}

function markClaim(claimId: number, fields: { status: "confirmed" | "rejected"; paymentId?: number; reason?: string }, actorId: number) {
  const r = db()
    .prepare("UPDATE claims SET status = ?, payment_id = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'")
    .run(fields.status, fields.paymentId ?? null, fields.reason ?? null, actorId, nowIso(), claimId);
  if (r.changes !== 1) throw new AppError("claimAlreadyReviewed");
}

/** Turns a claim into a real payment. Repeating it can never create a second payment. */
export function confirmClaim(claimId: number, actorId: number, lines?: PlanLine[] | null) {
  return tx(() => {
    const c = pendingClaim(claimId);
    const { paymentId } = recordPayment({
      memberId: c.member_id,
      amount: c.amount_paise,
      paidOn: c.paid_on,
      method: c.method,
      reference: c.reference,
      note: c.note,
      lines,
      idempotencyKey: `claim:${claimId}`,
      actorId,
    });
    markClaim(claimId, { status: "confirmed", paymentId }, actorId);
    audit(actorId, "claim.confirmed", { memberId: c.member_id, entity: "claim", entityId: claimId, detail: { paymentId } });
    return paymentId;
  });
}

/** The money was already recorded by Bharat: attach the claim to that payment instead of double-counting. */
export function linkClaim(claimId: number, paymentId: number, actorId: number) {
  tx(() => {
    const c = pendingClaim(claimId);
    const p = db()
      .prepare(
        "SELECT id FROM payments WHERE id = ? AND member_id = ? AND reversed_at IS NULL AND id NOT IN (SELECT payment_id FROM claims WHERE payment_id IS NOT NULL)",
      )
      .get(paymentId, c.member_id);
    if (!p) throw new AppError("paymentNotLinkable");
    markClaim(claimId, { status: "confirmed", paymentId }, actorId);
    audit(actorId, "claim.linked", { memberId: c.member_id, entity: "claim", entityId: claimId, detail: { paymentId } });
  });
}

export function rejectClaim(claimId: number, reason: string, actorId: number) {
  if (!reason.trim()) throw new AppError("reasonRequired", "reason");
  tx(() => {
    const c = pendingClaim(claimId);
    markClaim(claimId, { status: "rejected", reason: reason.trim() }, actorId);
    audit(actorId, "claim.rejected", { memberId: c.member_id, entity: "claim", entityId: claimId, detail: { reason: reason.trim() } });
  });
}

/** Recorded payments a claim might duplicate: same member, not reversed, not already linked. */
export function linkablePayments(memberId: number) {
  return db()
    .prepare(
      `SELECT id, amount_paise, paid_on, method, reference FROM payments
       WHERE member_id = ? AND reversed_at IS NULL AND id NOT IN (SELECT payment_id FROM claims WHERE payment_id IS NOT NULL)
       ORDER BY paid_on DESC, id DESC LIMIT 10`,
    )
    .all(memberId) as { id: number; amount_paise: number; paid_on: string; method: Method; reference: string | null }[];
}

// ───────────────────────────── approvals ─────────────────────────────

export function approveMember(
  userId: number,
  o: { billingStartMonth: string; openingDues?: { amount: number; note: string } | null; actorId: number },
) {
  if (!isMonth(o.billingStartMonth) || o.billingStartMonth > addMonths(currentMonth(), 1))
    throw new AppError("monthInvalid", "billingStartMonth");
  tx(() => {
    const r = db()
      .prepare("UPDATE users SET status = 'approved', reviewed_at = ?, reviewed_by = ? WHERE id = ? AND role = 'member' AND status = 'pending'")
      .run(nowIso(), o.actorId, userId);
    if (r.changes !== 1) throw new AppError("registrationNotPending");
    db().prepare("INSERT INTO members (user_id, billing_start_month) VALUES (?, ?)").run(userId, o.billingStartMonth);
    db()
      .prepare("INSERT INTO membership_status (member_id, status, effective_month, reason, created_by, created_at) VALUES (?, 'active', ?, 'approved', ?, ?)")
      .run(userId, o.billingStartMonth, o.actorId, nowIso());
    audit(o.actorId, "member.approved", { memberId: userId, detail: { billingStartMonth: o.billingStartMonth } });
    if (o.openingDues && o.openingDues.amount > 0)
      addCharge({ memberId: userId, kind: "opening", amount: o.openingDues.amount, description: o.openingDues.note || "Opening balance", actorId: o.actorId });
    generateCharges({ memberId: userId });
  });
}

export function rejectRegistration(userId: number, reason: string, actorId: number) {
  if (!reason.trim()) throw new AppError("reasonRequired", "reason");
  const r = db()
    .prepare("UPDATE users SET status = 'rejected', rejected_reason = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ? AND role = 'member' AND status = 'pending'")
    .run(reason.trim(), nowIso(), actorId, userId);
  if (r.changes !== 1) throw new AppError("registrationNotPending");
  audit(actorId, "registration.rejected", { entity: "user", entityId: userId, detail: { reason: reason.trim() } });
}

// ───────────────────────────── balances ─────────────────────────────

export type Balance = { outstanding: number; overdue: number; credit: number; pendingClaims: number; pendingClaimAmount: number };

export function balanceOf(memberId: number, today = todayIST()): Balance {
  return db()
    .prepare(
      `SELECT
        (SELECT COALESCE(SUM(amount_paise - paid_paise - waived_paise), 0) FROM charge_balances WHERE member_id = :id) AS outstanding,
        (SELECT COALESCE(SUM(amount_paise - paid_paise - waived_paise), 0) FROM charge_balances WHERE member_id = :id AND due_date < :today) AS overdue,
        (SELECT COALESCE(SUM(unallocated_paise), 0) FROM payment_balances WHERE member_id = :id AND reversed_at IS NULL) AS credit,
        (SELECT COUNT(*) FROM claims WHERE member_id = :id AND status = 'pending') AS pendingClaims,
        (SELECT COALESCE(SUM(amount_paise), 0) FROM claims WHERE member_id = :id AND status = 'pending') AS pendingClaimAmount`,
    )
    .get({ id: memberId, today }) as Balance;
}

const clean = (s: string | null | undefined) => (s?.trim() ? s.trim().slice(0, 300) : null);
