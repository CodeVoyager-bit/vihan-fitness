import { cache } from "react";
import { revokeSessions } from "./accounts";
import { getRules } from "./site";
import { AppError, all, audit, type ChargeDoc, db, nextId, nowIso, type PaymentDoc, setSetting, setting, settingInt, type StatusDoc, tx } from "./db";
import { REVERSED_PREFIX } from "./format";
import { type OpenCharge, type FutureMonth, type PlanLine, planAllocation, validatePlan } from "./plan";
import { addMonths, currentMonth, dueDateFor, isDate, isMonth, monthsBetween, todayIST } from "./time";

export type MemberStatus = "active" | "paused" | "left";
export type Method = "cash" | "upi" | "other";
export const METHODS: Method[] = ["cash", "upi", "other"];
export const MAX_PAYMENT_PAISE = 5_000_000; // ₹50,000 sanity cap per entry

// ───────────────────────────── balances ─────────────────────────────
// Nothing is stored as a running balance: a charge's paid/waived amounts and a payment's unallocated
// remainder are always derived from allocations and waivers. A reversed payment's allocations stop
// counting; nothing is deleted.

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

export type PaymentBalance = Omit<PaymentDoc, "_id"> & { id: number; unallocated_paise: number };

/**
 * Every charge and payment of one member (or everyone) with derived totals.
 * (ponytail: loads the rows into memory — fine for a gym of hundreds of members; switch to $group
 * pipelines if it ever holds tens of thousands.)
 */
export async function ledger(memberId?: number) {
  const d = await db();
  const q = memberId ? { member_id: memberId } : {};
  const [charges, payments, allocations, waivers] = await all(
    () => d.charges.find(q).toArray(),
    () => d.payments.find(q).toArray(),
    () => d.allocations.find(q).toArray(),
    () => d.waivers.find(q).toArray(),
  );
  const reversed = new Set(payments.filter((p) => p.reversed_at).map((p) => p._id));
  const add = (m: Map<number, number>, k: number, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  const paid = new Map<number, number>();
  const waived = new Map<number, number>();
  const used = new Map<number, number>();
  for (const a of allocations) {
    add(used, a.payment_id, a.amount_paise);
    if (!reversed.has(a.payment_id)) add(paid, a.charge_id, a.amount_paise);
  }
  for (const w of waivers) if (!w.reversed_at) add(waived, w.charge_id, w.amount_paise);
  return {
    charges: charges.map(({ _id, ...c }): ChargeRow => {
      const p = paid.get(_id) ?? 0;
      const w = waived.get(_id) ?? 0;
      return { id: _id, ...c, paid_paise: p, waived_paise: w, outstanding: c.amount_paise - p - w };
    }),
    payments: payments.map(({ _id, ...p }): PaymentBalance => ({ id: _id, ...p, unallocated_paise: p.amount_paise - (used.get(_id) ?? 0) })),
    allocations,
    waivers,
  };
}

/**
 * The whole ledger and status history, loaded once per page render however many parts of the screen ask
 * (cache() calls straight through in actions, scripts and tests, which must always read fresh).
 */
export const screenLedger = cache(() => ledger());
export const screenStatuses = cache(() => loadStatuses());

const byDueDesc = (a: ChargeRow, b: ChargeRow) => b.due_date.localeCompare(a.due_date) || b.id - a.id;

/** Opening balances first, then oldest due; the order payments are applied in. */
export function toOpen(charges: ChargeRow[], today: string): OpenCharge[] {
  return charges
    .filter((c) => c.outstanding > 0)
    .sort(
      (a, b) =>
        Number(b.kind === "opening") - Number(a.kind === "opening") ||
        a.due_date.localeCompare(b.due_date) ||
        (a.period_month ?? "").localeCompare(b.period_month ?? "") ||
        a.id - b.id,
    )
    .map((c) => ({ id: c.id, kind: c.kind, description: c.description, month: c.period_month, outstanding: c.outstanding, overdue: c.due_date < today }));
}

// ───────────────────────────── fees & status ─────────────────────────────

export async function feeFor(month: string): Promise<number | null> {
  const r = await (await db()).fee_schedule.findOne({ _id: { $lte: month } }, { sort: { _id: -1 } });
  return r?.amount_paise ?? null;
}

export async function statusAt(memberId: number, month: string): Promise<MemberStatus | null> {
  const r = await (await db()).membership_status.findOne({ member_id: memberId, effective_month: { $lte: month } }, { sort: { effective_month: -1, _id: -1 } });
  return r?.status ?? null;
}

// Loops over months load the fee schedule and status history once and look months up in memory:
// each query is a network round trip to the hosted database.
type Fee = { effective_month: string; amount_paise: number };
const loadFees = async (): Promise<Fee[]> =>
  (await (await db()).fee_schedule.find({}, { sort: { _id: -1 } }).toArray()).map((f) => ({ effective_month: f._id, amount_paise: f.amount_paise }));
const feeIn = (fees: Fee[], month: string) => fees.find((f) => f.effective_month <= month)?.amount_paise ?? null;

/** Status history per member, newest first. */
export async function loadStatuses(memberId?: number): Promise<Map<number, StatusDoc[]>> {
  const rows = await (await db()).membership_status.find(memberId ? { member_id: memberId } : {}, { sort: { effective_month: -1, _id: -1 } }).toArray();
  const out = new Map<number, StatusDoc[]>();
  for (const r of rows) out.set(r.member_id, [...(out.get(r.member_id) ?? []), r]);
  return out;
}
/** The status row that governs a month (latest effective month on or before it). */
export const statusRowIn = (rows: StatusDoc[] | undefined, month: string) => rows?.find((r) => r.effective_month <= month);

async function member(memberId: number) {
  const m = await (await db()).users.findOne({ uid: memberId, role: "member", status: "approved" }, { projection: { uid: 1, billing_start_month: 1 } });
  if (!m?.billing_start_month) throw new AppError("memberNotFound");
  return { id: m.uid, billing_start_month: m.billing_start_month };
}

const firstBillableMonth = (billingStart: string, launch: string | undefined) => (!launch ? null : billingStart > launch ? billingStart : launch);

// ───────────────────────────── charges ─────────────────────────────

/**
 * Creates the monthly charge for every eligible (approved, active that month, on/after launch & billing start)
 * member-month up to `upto`. Safe to run any number of times: existing months are skipped, and a unique
 * index refuses a duplicate anyway.
 */
export async function generateCharges(opts: { upto?: string; memberId?: number } = {}): Promise<number> {
  const upto = opts.upto ?? currentMonth();
  return tx(async () => {
    const launch = await setting("launch_month");
    if (!launch) return 0;
    const dueDay = await settingInt("due_day", 10);
    const d = await db();
    const only = opts.memberId ? { member_id: opts.memberId } : {};
    const members = await d.users
      .find({ role: "member", status: "approved", ...(opts.memberId ? { uid: opts.memberId } : {}) }, { projection: { uid: 1, billing_start_month: 1 } })
      .toArray();
    const fees = await loadFees();
    const statuses = await loadStatuses(opts.memberId);
    const billed = new Set((await d.charges.find({ kind: "monthly", ...only }, { projection: { member_id: 1, period_month: 1 } }).toArray()).map((r) => `${r.member_id}|${r.period_month}`));

    const docs: Omit<ChargeDoc, "_id">[] = [];
    for (const m of members) {
      const start = firstBillableMonth(m.billing_start_month!, launch)!;
      for (const month of monthsBetween(start, upto)) {
        if (billed.has(`${m.uid}|${month}`) || statusRowIn(statuses.get(m.uid), month)?.status !== "active") continue;
        const fee = feeIn(fees, month);
        if (!fee) continue;
        docs.push({ member_id: m.uid, kind: "monthly", period_month: month, amount_paise: fee, due_date: dueDateFor(month, dueDay), description: null, created_by: null, created_at: nowIso() });
      }
    }
    if (docs.length) {
      const first = await nextId("charges", docs.length);
      await d.charges.insertMany(docs.map((c, i) => ({ _id: first + i, ...c })));
      const { payments } = await ledger(opts.memberId);
      const withCredit = new Set(payments.filter((p) => !p.reversed_at && p.unallocated_paise > 0).map((p) => p.member_id));
      for (const id of new Set(docs.map((c) => c.member_id))) if (withCredit.has(id)) await settle(id);
      await audit(null, "billing.generated", { detail: { upto, created: docs.length } });
    }
    return docs.length;
  });
}

const g = globalThis as unknown as { __vfBilledOn?: string; __vfBilling?: Promise<void> };
/**
 * Cheap daily catch-up so charges appear on the 1st without a cron job. The day is remembered in the
 * database too, so only the first request of the day (across all server instances) does the work.
 */
export async function ensureBillingCurrent() {
  const today = todayIST();
  if (g.__vfBilledOn === today) return;
  await (g.__vfBilling ??= (async () => {
    if ((await setting("billed_on")) !== today) {
      await generateCharges();
      await setSetting("billed_on", today);
    }
    g.__vfBilledOn = today;
  })().finally(() => (g.__vfBilling = undefined)));
}
export async function invalidateBillingCache() {
  g.__vfBilledOn = undefined;
  await setSetting("billed_on", "");
}

/**
 * Launch month and due day. Moving launch earlier extends the earliest fee back to it; moving it later
 * is refused once monthly charges exist before the new month (those dues would silently stay owed).
 */
export async function setBillingSettings(launch: string, dueDay: number, actorId: number) {
  if (!isMonth(launch)) throw new AppError("monthInvalid", "launchMonth");
  if (!(Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 28)) throw new AppError("invalidInput", "dueDay");
  await tx(async () => {
    const d = await db();
    if (await d.charges.findOne({ kind: "monthly", period_month: { $lt: launch } }, { projection: { _id: 1 } })) throw new AppError("launchHasCharges", "launchMonth");
    await setSetting("launch_month", launch);
    await setSetting("due_day", String(dueDay));
    const first = await d.fee_schedule.findOne({}, { sort: { _id: 1 } });
    if (!first || first._id > launch) await d.fee_schedule.insertOne({ _id: launch, amount_paise: first?.amount_paise ?? 50_000, created_at: nowIso() });
    await audit(actorId, "settings.updated", { detail: { launch, dueDay } });
    await generateCharges();
  });
  await invalidateBillingCache();
}

/** A fee from `month` onward. Charges already created keep their stored amount. */
export async function setFee(month: string, amount: number, actorId: number) {
  await (await db()).fee_schedule.updateOne({ _id: month }, { $set: { amount_paise: amount }, $setOnInsert: { created_at: nowIso() } }, { upsert: true });
  await audit(actorId, "settings.updated", { detail: { fee: amount, from: month } });
  await generateCharges();
}

export async function addCharge(o: {
  memberId: number;
  kind: "opening" | "manual";
  amount: number;
  description: string;
  periodMonth?: string | null;
  actorId: number;
}) {
  if (!Number.isInteger(o.amount) || o.amount <= 0) throw new AppError("amountInvalid", "amount");
  if (o.amount > MAX_PAYMENT_PAISE) throw new AppError("amountTooLarge", "amount");
  if (!o.description.trim()) throw new AppError("reasonRequired", "description");
  if (o.periodMonth && !isMonth(o.periodMonth)) throw new AppError("monthInvalid", "periodMonth");
  return tx(async () => {
    await member(o.memberId);
    const id = await nextId("charges");
    await (await db()).charges.insertOne({
      _id: id,
      member_id: o.memberId,
      kind: o.kind,
      period_month: o.periodMonth ?? null,
      amount_paise: o.amount,
      due_date: todayIST(),
      description: o.description.trim(),
      created_by: o.actorId,
      created_at: nowIso(),
    });
    await audit(o.actorId, `charge.${o.kind}`, {
      memberId: o.memberId,
      entity: "charge",
      entityId: id,
      detail: { amount: o.amount, description: o.description, periodMonth: o.periodMonth ?? null },
    });
    await settle(o.memberId);
    return id;
  });
}

export async function chargesFor(memberId: number): Promise<ChargeRow[]> {
  return (await ledger(memberId)).charges.sort(byDueDesc);
}

export async function openCharges(memberId: number, today = todayIST()): Promise<OpenCharge[]> {
  return toOpen((await ledger(memberId)).charges, today);
}

/** Upcoming months that have no charge yet but would be billed (used for advance payments). */
export async function unbilledMonths(memberId: number, count = 12): Promise<FutureMonth[]> {
  const d = await db();
  const [m, launch, monthly, fees, statusMap] = await all(
    () => member(memberId),
    () => setting("launch_month"),
    () => d.charges.find({ member_id: memberId, kind: "monthly" }, { projection: { period_month: 1 } }).toArray(),
    () => loadFees(),
    () => loadStatuses(memberId),
  );
  const start = firstBillableMonth(m.billing_start_month, launch);
  if (!start) return [];
  const now = currentMonth();
  const from = start > now ? start : now;
  const billed = new Set(monthly.map((r) => r.period_month));
  const statuses = statusMap.get(memberId);
  const out: FutureMonth[] = [];
  for (const month of monthsBetween(from, addMonths(now, count))) {
    if (billed.has(month) || statusRowIn(statuses, month)?.status !== "active") continue;
    const fee = feeIn(fees, month);
    if (fee) out.push({ month, fee });
  }
  return out;
}

/** The month's charge, created now if it doesn't exist yet (advance payments). Called inside a transaction. */
async function ensureMonthlyCharge(memberId: number, month: string): Promise<number> {
  const d = await db();
  const existing = await d.charges.findOne({ member_id: memberId, kind: "monthly", period_month: month }, { projection: { _id: 1 } });
  if (existing) return existing._id;
  const id = await nextId("charges");
  await d.charges.insertOne({
    _id: id,
    member_id: memberId,
    kind: "monthly",
    period_month: month,
    amount_paise: (await feeFor(month))!,
    due_date: dueDateFor(month, await settingInt("due_day", 10)),
    description: null,
    created_by: null,
    created_at: nowIso(),
  });
  return id;
}

// ───────────────────────────── credit settlement ─────────────────────────────

const allocate = (paymentId: number, chargeId: number, memberId: number, amount: number) => ({
  updateOne: {
    filter: { payment_id: paymentId, charge_id: chargeId },
    update: { $inc: { amount_paise: amount }, $setOnInsert: { member_id: memberId, created_at: nowIso() } },
    upsert: true,
  },
});

/** Applies any unallocated (advance) money to unpaid charges, oldest first. */
export async function settle(memberId: number) {
  const { charges, payments } = await ledger(memberId);
  const credits = payments
    .filter((p) => !p.reversed_at && p.unallocated_paise > 0)
    .sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.id - b.id)
    .map((p) => ({ id: p.id, left: p.unallocated_paise }));
  if (!credits.length) return;
  const ops = [];
  for (const c of toOpen(charges, todayIST())) {
    let need = c.outstanding;
    for (const p of credits) {
      if (need <= 0) break;
      if (p.left <= 0) continue;
      const take = Math.min(need, p.left);
      ops.push(allocate(p.id, c.id, memberId, take));
      p.left -= take;
      need -= take;
    }
  }
  await (await db()).allocations.bulkWrite(ops);
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
  if (!Number.isInteger(amount) || amount <= 0) throw new AppError("amountInvalid", "amount");
  if (amount > MAX_PAYMENT_PAISE) throw new AppError("amountTooLarge", "amount");
  if (!isDate(paidOn) || paidOn > todayIST() || paidOn < "2020-01-01") throw new AppError("dateInvalid", "paidOn");
  if (!METHODS.includes(method as Method)) throw new AppError("methodInvalid", "method");
}

/** Records money Bharat received outside the app. Atomic; a repeated idempotency key returns the first payment. */
export async function recordPayment(i: RecordPaymentInput): Promise<{ paymentId: number; duplicate: boolean }> {
  checkPaymentFields(i.amount, i.paidOn, i.method);
  return tx(async () => {
    const d = await db();
    if (i.idempotencyKey) {
      // $type lets the planner use the partial unique index; a bare equality would scan every payment.
      const prev = await d.payments.findOne({ idempotency_key: { $eq: i.idempotencyKey, $type: "string" } }, { projection: { member_id: 1 } });
      if (prev && prev.member_id !== i.memberId) throw new AppError("invalidInput");
      if (prev) return { paymentId: prev._id, duplicate: true };
    }
    await member(i.memberId);
    const open = await openCharges(i.memberId);
    const future = await unbilledMonths(i.memberId);
    let lines: PlanLine[];
    if (i.lines) {
      const err = validatePlan(i.amount, i.lines, open, future);
      if (err) throw new AppError(err);
      lines = i.lines;
    } else lines = planAllocation(i.amount, open, future).lines;

    const paymentId = await nextId("payments");
    await d.payments.insertOne({
      _id: paymentId,
      member_id: i.memberId,
      amount_paise: i.amount,
      paid_on: i.paidOn,
      method: i.method,
      reference: clean(i.reference),
      note: clean(i.note),
      idempotency_key: i.idempotencyKey ?? null,
      recorded_by: i.actorId,
      created_at: nowIso(),
      reversed_at: null,
      reversed_by: null,
      reversal_reason: null,
    });
    const ops = [];
    for (const l of lines) ops.push(allocate(paymentId, l.chargeId ?? (await ensureMonthlyCharge(i.memberId, l.month!)), i.memberId, l.amount));
    await d.allocations.bulkWrite(ops);
    // Whatever wasn't split goes to the oldest unpaid charge; credit and debt never sit side by side.
    await settle(i.memberId);
    await audit(i.actorId, "payment.recorded", {
      memberId: i.memberId,
      entity: "payment",
      entityId: paymentId,
      detail: { amount: i.amount, method: i.method, paidOn: i.paidOn, lines },
    });
    return { paymentId, duplicate: false };
  });
}

/** What a payment ended up paying for, for the confirmation screen and receipt. */
export async function paymentSummary(paymentId: number) {
  const d = await db();
  const p = await d.payments.findOne({ _id: paymentId });
  if (!p) throw new AppError("paymentNotFound");
  const { payments, charges, allocations } = await ledger(p.member_id);
  const monthly = new Map(charges.filter((c) => c.kind === "monthly").map((c) => [c.id, c.period_month!]));
  const months = allocations
    .filter((a) => a.payment_id === paymentId && monthly.has(a.charge_id))
    .map((a) => monthly.get(a.charge_id)!)
    .sort();
  const name = (await d.users.findOne({ uid: p.member_id }, { projection: { name: 1 } }))?.name ?? "";
  return { amount: p.amount_paise, paidOn: p.paid_on, method: p.method, months, credit: payments.find((x) => x.id === paymentId)!.unallocated_paise, name };
}

/** Corrections never delete: the payment stays on record, marked reversed, and stops counting. */
export async function reversePayment(paymentId: number, reason: string, actorId: number) {
  if (!reason.trim()) throw new AppError("reasonRequired", "reason");
  await tx(async () => {
    const d = await db();
    const p = await d.payments.findOne({ _id: paymentId, reversed_at: null }, { projection: { member_id: 1, amount_paise: 1 } });
    if (!p) throw new AppError("paymentNotFound");
    await d.payments.updateOne({ _id: paymentId }, { $set: { reversed_at: nowIso(), reversed_by: actorId, reversal_reason: reason.trim() } });
    // A confirmed claim backed by this payment is no longer true.
    await d.claims.updateMany(
      { payment_id: paymentId },
      { $set: { status: "rejected", reject_reason: `${REVERSED_PREFIX}${reason.trim()}`, reviewed_by: actorId, reviewed_at: nowIso() } },
    );
    const removed = await dropUnusedFutureCharges(p.member_id);
    await reconcileStatusWaivers(p.member_id, actorId);
    await settle(p.member_id);
    await audit(actorId, "payment.reversed", {
      memberId: p.member_id,
      entity: "payment",
      entityId: paymentId,
      detail: { amount: p.amount_paise, reason: reason.trim(), removedMonths: removed },
    });
  });
}

export async function waiveCharge(chargeId: number, amount: number, reason: string, actorId: number | null, source: "admin" | "status" = "admin") {
  if (!reason.trim()) throw new AppError("reasonRequired", "reason");
  await tx(async () => {
    const d = await db();
    const doc = await d.charges.findOne({ _id: chargeId }, { projection: { member_id: 1 } });
    const c = doc && (await ledger(doc.member_id)).charges.find((x) => x.id === chargeId);
    if (!c) throw new AppError("chargeNotFound");
    if (!Number.isInteger(amount) || amount <= 0) throw new AppError("amountInvalid", "amount");
    if (amount > c.outstanding) throw new AppError("amountOverDue", "amount");
    const id = await nextId("waivers");
    await d.waivers.insertOne({
      _id: id,
      charge_id: chargeId,
      member_id: c.member_id,
      amount_paise: amount,
      reason: reason.trim(),
      source,
      created_by: actorId,
      created_at: nowIso(),
      reversed_at: null,
      reversed_by: null,
      reversal_reason: null,
    });
    await audit(actorId, "charge.waived", { memberId: c.member_id, entity: "waiver", entityId: id, detail: { chargeId, amount, reason: reason.trim(), source } });
  });
}

export async function reverseWaiver(waiverId: number, reason: string, actorId: number) {
  if (!reason.trim()) throw new AppError("reasonRequired", "reason");
  await tx(async () => {
    const d = await db();
    const w = await d.waivers.findOne({ _id: waiverId, reversed_at: null }, { projection: { member_id: 1 } });
    if (!w) throw new AppError("waiverNotFound");
    await d.waivers.updateOne({ _id: waiverId }, { $set: { reversed_at: nowIso(), reversed_by: actorId, reversal_reason: reason.trim() } });
    await audit(actorId, "waiver.reversed", { memberId: w.member_id, entity: "waiver", entityId: waiverId, detail: { reason: reason.trim() } });
    // A paused/left month must stay waived: whatever this frees up goes back to the status waiver.
    await reconcileStatusWaivers(w.member_id, actorId);
    await settle(w.member_id);
  });
}

// ───────────────────────────── membership status ─────────────────────────────

/** Unpaid monthly charges that a pause/leave from `fromMonth` would cancel (anything already paid is kept). */
export async function chargesAffectedByStop(memberId: number, fromMonth: string) {
  return (await ledger(memberId)).charges
    .filter((c) => c.kind === "monthly" && c.period_month! >= fromMonth && c.outstanding > 0)
    .sort((a, b) => a.period_month!.localeCompare(b.period_month!))
    .map((c) => ({ id: c.id, period_month: c.period_month!, paid_paise: c.paid_paise, outstanding: c.outstanding }));
}

export async function setMemberStatus(memberId: number, status: MemberStatus, effectiveMonth: string, reason: string | null, actorId: number) {
  if (!["active", "paused", "left"].includes(status)) throw new AppError("statusInvalid");
  if (!isMonth(effectiveMonth)) throw new AppError("monthInvalid", "effectiveMonth");
  await tx(async () => {
    const m = await member(memberId);
    if (effectiveMonth < m.billing_start_month) throw new AppError("monthBeforeStart", "effectiveMonth");
    await (await db()).membership_status.insertOne({
      _id: await nextId("membership_status"),
      member_id: memberId,
      status,
      effective_month: effectiveMonth,
      reason: clean(reason),
      created_by: actorId,
      created_at: nowIso(),
    });
    // Judge every month against the whole history, so back-dated corrections land correctly.
    await reconcileStatusWaivers(memberId, actorId);
    await generateCharges({ memberId });
    await settle(memberId);
    await audit(actorId, "member.status", { memberId, detail: { status, effectiveMonth, reason: clean(reason) } });
  });
}

/**
 * Months governed by paused/left get their unpaid remainder waived (source 'status'); months that are
 * active again get those automatic waivers undone. Idempotent. Anything already paid stays paid.
 */
export async function reconcileStatusWaivers(memberId: number, actorId: number | null) {
  const charges = (await ledger(memberId)).charges.filter((c) => c.kind === "monthly").sort((a, b) => a.period_month!.localeCompare(b.period_month!));
  const statuses = (await loadStatuses(memberId)).get(memberId);
  const d = await db();
  for (const c of charges) {
    const row = statusRowIn(statuses, c.period_month!);
    if (row && row.status !== "active") {
      if (c.outstanding > 0) await waiveCharge(c.id, c.outstanding, `status:${row.status}:${row.effective_month}`, actorId, "status");
    } else {
      await d.waivers.updateMany(
        { charge_id: c.id, source: "status", reversed_at: null },
        { $set: { reversed_at: nowIso(), reversed_by: actorId, reversal_reason: `status:active:${row?.effective_month ?? c.period_month}` } },
      );
    }
  }
}

/**
 * Advance payments create next months' charges early. Once nothing pays them (e.g. the payment was
 * reversed) they are removed again; the monthly billing recreates them at the right time and fee.
 */
async function dropUnusedFutureCharges(memberId: number): Promise<string[]> {
  const { charges, waivers } = await ledger(memberId);
  const waivedOnce = new Set(waivers.map((w) => w.charge_id));
  const unused = charges.filter((c) => c.kind === "monthly" && c.period_month! > currentMonth() && c.paid_paise === 0 && !waivedOnce.has(c.id));
  const d = await db();
  for (const c of unused) {
    await d.allocations.deleteMany({ charge_id: c.id }); // only reversed payments point here
    await d.charges.deleteOne({ _id: c.id });
  }
  return unused.map((c) => c.period_month!);
}

// ───────────────────────────── claims ─────────────────────────────

export async function submitClaim(memberId: number, c: { amount: number; paidOn: string; method: Method; reference?: string | null; note?: string | null }) {
  checkPaymentFields(c.amount, c.paidOn, c.method);
  return tx(async () => {
    await member(memberId);
    const d = await db();
    if ((await d.claims.count({ member_id: memberId, status: "pending" })) >= (await getRules()).maxClaims) throw new AppError("tooManyClaims");
    const id = await nextId("claims");
    await d.claims.insertOne({
      _id: id,
      member_id: memberId,
      amount_paise: c.amount,
      paid_on: c.paidOn,
      method: c.method,
      reference: clean(c.reference),
      note: clean(c.note),
      status: "pending",
      payment_id: null,
      reviewed_by: null,
      reviewed_at: null,
      reject_reason: null,
      created_at: nowIso(),
    });
    await audit(memberId, "claim.submitted", { memberId, entity: "claim", entityId: id, detail: { amount: c.amount } });
    return id;
  });
}

async function pendingClaim(claimId: number) {
  const c = await (await db()).claims.findOne({ _id: claimId });
  if (!c) throw new AppError("claimNotFound");
  if (c.status !== "pending") throw new AppError("claimAlreadyReviewed");
  return c;
}

async function markClaim(claimId: number, fields: { status: "confirmed" | "rejected"; paymentId?: number; reason?: string }, actorId: number) {
  const r = await (await db()).claims.updateOne(
    { _id: claimId, status: "pending" },
    { $set: { status: fields.status, payment_id: fields.paymentId ?? null, reject_reason: fields.reason ?? null, reviewed_by: actorId, reviewed_at: nowIso() } },
  );
  if (r.modifiedCount !== 1) throw new AppError("claimAlreadyReviewed");
}

/** Turns a claim into a real payment. Repeating it can never create a second payment. */
export async function confirmClaim(claimId: number, actorId: number, lines?: PlanLine[] | null) {
  return tx(async () => {
    const c = await pendingClaim(claimId);
    const { paymentId } = await recordPayment({
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
    await markClaim(claimId, { status: "confirmed", paymentId }, actorId);
    await audit(actorId, "claim.confirmed", { memberId: c.member_id, entity: "claim", entityId: claimId, detail: { paymentId } });
    return paymentId;
  });
}

/** The money was already recorded by Bharat: attach the claim to that payment instead of double-counting. */
export async function linkClaim(claimId: number, paymentId: number, actorId: number) {
  await tx(async () => {
    const c = await pendingClaim(claimId);
    const d = await db();
    const p = await d.payments.findOne({ _id: paymentId, member_id: c.member_id, reversed_at: null }, { projection: { amount_paise: 1 } });
    if (!p || (await d.claims.findOne({ payment_id: paymentId }, { projection: { _id: 1 } }))) throw new AppError("paymentNotLinkable");
    if (p.amount_paise !== c.amount_paise) throw new AppError("claimAmountMismatch");
    await markClaim(claimId, { status: "confirmed", paymentId }, actorId);
    await audit(actorId, "claim.linked", { memberId: c.member_id, entity: "claim", entityId: claimId, detail: { paymentId } });
  });
}

export async function rejectClaim(claimId: number, reason: string, actorId: number) {
  if (!reason.trim()) throw new AppError("reasonRequired", "reason");
  await tx(async () => {
    const c = await pendingClaim(claimId);
    await markClaim(claimId, { status: "rejected", reason: reason.trim() }, actorId);
    await audit(actorId, "claim.rejected", { memberId: c.member_id, entity: "claim", entityId: claimId, detail: { reason: reason.trim() } });
  });
}

/** Recorded payments a claim might duplicate: same member, not reversed, not already linked. */
export async function linkablePayments(memberId: number) {
  const d = await db();
  const linked = (await d.claims.find({ member_id: memberId, payment_id: { $ne: null } }, { projection: { payment_id: 1 } }).toArray()).map((c) => c.payment_id!);
  const rows = await d.payments
    .find({ member_id: memberId, reversed_at: null, _id: { $nin: linked } }, { sort: { paid_on: -1, _id: -1 }, limit: 10, projection: { amount_paise: 1, paid_on: 1, method: 1, reference: 1 } })
    .toArray();
  return rows.map((p) => ({ id: p._id, amount_paise: p.amount_paise, paid_on: p.paid_on, method: p.method, reference: p.reference }));
}

// ───────────────────────────── approvals ─────────────────────────────

export async function approveMember(userId: number, o: { billingStartMonth: string; openingDues?: { amount: number; note: string } | null; actorId: number }) {
  if (!isMonth(o.billingStartMonth) || o.billingStartMonth > addMonths(currentMonth(), 1)) throw new AppError("monthInvalid", "billingStartMonth");
  await tx(async () => {
    const d = await db();
    const r = await d.users.updateOne(
      { uid: userId, role: "member", status: "pending" },
      { $set: { status: "approved", reviewed_at: nowIso(), reviewed_by: o.actorId, billing_start_month: o.billingStartMonth, followup_opt_in: 1, admin_note: null } },
    );
    if (r.modifiedCount !== 1) throw new AppError("registrationNotPending");
    await d.membership_status.insertOne({
      _id: await nextId("membership_status"),
      member_id: userId,
      status: "active",
      effective_month: o.billingStartMonth,
      reason: "approved",
      created_by: o.actorId,
      created_at: nowIso(),
    });
    await audit(o.actorId, "member.approved", { memberId: userId, detail: { billingStartMonth: o.billingStartMonth } });
    if (o.openingDues && o.openingDues.amount > 0)
      await addCharge({ memberId: userId, kind: "opening", amount: o.openingDues.amount, description: o.openingDues.note || "Opening balance", actorId: o.actorId });
    await generateCharges({ memberId: userId });
  });
}

export async function rejectRegistration(userId: number, reason: string, actorId: number) {
  if (!reason.trim()) throw new AppError("reasonRequired", "reason");
  const r = await (await db()).users.updateOne(
    { uid: userId, role: "member", status: "pending" },
    { $set: { status: "rejected", rejected_reason: reason.trim(), reviewed_at: nowIso(), reviewed_by: actorId } },
  );
  if (r.modifiedCount !== 1) throw new AppError("registrationNotPending");
  await revokeSessions(userId);
  await audit(actorId, "registration.rejected", { entity: "user", entityId: userId, detail: { reason: reason.trim() } });
}

// ───────────────────────────── balances ─────────────────────────────

export type Balance = { outstanding: number; overdue: number; credit: number; pendingClaims: number; pendingClaimAmount: number };

export async function balanceOf(memberId: number, today = todayIST()): Promise<Balance> {
  const [{ charges, payments }, pending] = await all(
    () => ledger(memberId),
    async () => (await db()).claims.find({ member_id: memberId, status: "pending" }, { projection: { amount_paise: 1 } }).toArray(),
  );
  return {
    outstanding: sum(charges.map((c) => c.outstanding)),
    overdue: sum(charges.filter((c) => c.due_date < today).map((c) => c.outstanding)),
    credit: sum(payments.filter((p) => !p.reversed_at).map((p) => p.unallocated_paise)),
    pendingClaims: pending.length,
    pendingClaimAmount: sum(pending.map((c) => c.amount_paise)),
  };
}

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const clean = (s: string | null | undefined) => (s?.trim() ? s.trim().slice(0, 300) : null);
