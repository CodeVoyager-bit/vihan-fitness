// Read models for screens. Every caller is already behind requireAdmin()/requireMember().
// Loads shared by several parts of one screen go through cache(): once per page render.
import { cache } from "react";
import { all, db, type StatusDoc } from "./db";
import { lastVisits } from "./engage";
import type { OpenCharge } from "./plan";
import { type ChargeRow, type MemberStatus, type Method, ledger, loadStatuses, screenLedger, screenStatuses, statusRowIn, sum, toOpen } from "./ledger";
import { addMonths, currentMonth, monthOf, todayIST } from "./time";

export type MonthState = "paid" | "part" | "unpaid" | "overdue" | "waived" | "none" | "notStarted";

type Lang = "en" | "mr" | "hi";

/** uid → name/phone/photo/role, for showing who a record belongs to. */
async function people(uids: number[]) {
  const rows = await (await db()).users.find({ uid: { $in: [...new Set(uids)] } }, { projection: { uid: 1, name: 1, phone: 1, photo: 1, role: 1, language: 1 } }).toArray();
  return new Map(rows.map((u) => [u.uid, u]));
}

const groupBy = <T, K>(xs: T[], key: (x: T) => K) => {
  const m = new Map<K, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
};

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

const approvedMembers = cache(async () => (await db()).users.find({ role: "member", status: "approved" }).toArray());

/** One member's unpaid charges in payment order, from the screen's shared ledger. */
export async function openChargesOf(memberId: number, today = todayIST()): Promise<OpenCharge[]> {
  return toOpen((await screenLedger()).charges.filter((c) => c.member_id === memberId), today);
}

/** The earliest status change after `month` (a scheduled pause, leave or return). */
function nextStatus(rows: StatusDoc[] | undefined, month: string) {
  let next: StatusDoc | undefined;
  for (const r of rows ?? []) if (r.effective_month > month && (!next || r.effective_month < next.effective_month || (r.effective_month === next.effective_month && r._id > next._id))) next = r;
  return next;
}

export type DirRow = {
  id: number;
  name: string;
  phone: string;
  photo: string | null;
  language: Lang;
  billing_start_month: string;
  followup_opt_in: number;
  status: MemberStatus;
  outstanding: number;
  overdue: number;
  credit: number;
  pending_claims: number;
  pending_claim_amount: number;
  last_visit: string | null;
  m_amount: number | null;
  m_paid: number | null;
  m_waived: number | null;
  m_due: string | null;
  next_status: MemberStatus | null;
  next_month: string | null;
};

export async function directory(today = todayIST()): Promise<DirRow[]> {
  const month = monthOf(today);
  const d = await db();
  const [members, statuses, { charges, payments }, pending, visits] = await all(
    () => approvedMembers(),
    () => screenStatuses(),
    () => screenLedger(),
    () => d.claims.aggregate<{ _id: number; n: number; amount: number }>([{ $match: { status: "pending" } }, { $group: { _id: "$member_id", n: { $sum: 1 }, amount: { $sum: "$amount_paise" } } }]).toArray(),
    () => lastVisits(),
  );
  const chargesOf = groupBy(charges, (c) => c.member_id);
  const paymentsOf = groupBy(payments, (p) => p.member_id);
  const claimsOf = new Map(pending.map((c) => [c._id, c]));
  return members
    .map((u): DirRow => {
      const cs = chargesOf.get(u.uid) ?? [];
      const m = cs.find((c) => c.kind === "monthly" && c.period_month === month);
      const next = nextStatus(statuses.get(u.uid), month);
      return {
        id: u.uid,
        name: u.name,
        phone: u.phone,
        photo: u.photo ?? null,
        language: u.language,
        billing_start_month: u.billing_start_month!,
        followup_opt_in: u.followup_opt_in ?? 1,
        status: statusRowIn(statuses.get(u.uid), month)?.status ?? "active",
        next_status: next?.status ?? null,
        next_month: next?.effective_month ?? null,
        outstanding: sum(cs.map((c) => c.outstanding)),
        overdue: sum(cs.filter((c) => c.due_date < today).map((c) => c.outstanding)),
        credit: sum((paymentsOf.get(u.uid) ?? []).filter((p) => !p.reversed_at).map((p) => p.unallocated_paise)),
        pending_claims: claimsOf.get(u.uid)?.n ?? 0,
        pending_claim_amount: claimsOf.get(u.uid)?.amount ?? 0,
        last_visit: visits.get(u.uid) ?? null,
        m_amount: m?.amount_paise ?? null,
        m_paid: m?.paid_paise ?? null,
        m_waived: m?.waived_paise ?? null,
        m_due: m?.due_date ?? null,
      };
    })
    .sort(byName);
}

export function monthState(r: Pick<DirRow, "status" | "billing_start_month" | "m_amount" | "m_paid" | "m_waived" | "m_due">, today = todayIST()): MonthState {
  const month = monthOf(today);
  if (r.m_amount == null) return r.status === "active" && r.billing_start_month > month ? "notStarted" : "none";
  const left = r.m_amount - (r.m_paid ?? 0) - (r.m_waived ?? 0);
  if (left <= 0) return (r.m_paid ?? 0) > 0 ? "paid" : "waived";
  if ((r.m_paid ?? 0) > 0) return "part";
  return r.m_due && r.m_due < today ? "overdue" : "unpaid";
}

export async function dashboard(today = todayIST()) {
  const month = monthOf(today);
  const [{ charges, payments }, counts, members, statuses] = await all(
    () => screenLedger(),
    () => inboxCounts(),
    () => approvedMembers(),
    () => screenStatuses(),
  );
  const received = payments.filter((p) => !p.reversed_at && p.paid_on.startsWith(`${month}-`));
  /** Members owing something (on all charges, or only on charges past their due date). */
  const owing = (cs: ChargeRow[]) => [...groupBy(cs, (c) => c.member_id).values()].map((xs) => sum(xs.map((c) => c.outstanding))).filter((o) => o > 0);
  const owed = owing(charges);
  const overdue = owing(charges.filter((c) => c.due_date < today));
  return {
    received: sum(received.map((p) => p.amount_paise)),
    receivedCount: received.length,
    outstanding: sum(owed),
    outstandingMembers: owed.length,
    overdue: sum(overdue),
    overdueMembers: overdue.length,
    active: members.filter((u) => statusRowIn(statuses.get(u.uid), month)?.status === "active").length,
    ...counts,
  };
}

export const inboxCounts = cache(async () => {
  const d = await db();
  const [claims, approvals, help] = await all(
    () => d.claims.count({ status: "pending" }),
    () => d.users.count({ role: "member", status: "pending" }),
    () => d.help_requests.count({ status: "open" }),
  );
  return { claims, approvals, help };
});

export type ActivityRow = { id: number; at: string; action: string; member_id: number | null; member: string | null; detail: string | null; actor: string | null; actor_role: string | null };

export async function activity(limit = 12, memberId?: number): Promise<ActivityRow[]> {
  const rows = await (await db()).audit.find(memberId ? { member_id: memberId } : { action: { $ne: "billing.generated" } }, { sort: { _id: -1 }, limit }).toArray();
  const who = await people(rows.flatMap((r) => [r.member_id, r.actor_id].filter((x): x is number => x != null)));
  return rows.map((r) => ({
    id: r._id,
    at: r.at,
    action: r.action,
    member_id: r.member_id,
    member: r.member_id == null ? null : (who.get(r.member_id)?.name ?? null),
    detail: r.detail,
    actor: r.actor_id == null ? null : (who.get(r.actor_id)?.name ?? null),
    actor_role: r.actor_id == null ? null : (who.get(r.actor_id)?.role ?? null),
  }));
}

export async function pendingRegistrations() {
  const d = await db();
  const [rows, existing] = await all(
    () => d.users.find({ role: "member", status: "pending" }, { sort: { createdAt: 1 } }).toArray(),
    () => d.users.find({ role: "member", status: "approved" }, { projection: { uid: 1, name: 1, phone: 1 } }).toArray(),
  );
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}]/gu, "");
  return rows.map((r) => {
    const dup = existing.find((e) => norm(e.name) === norm(r.name));
    return {
      id: r.uid,
      name: r.name,
      phone: r.phone,
      language: r.language,
      created_at: r.createdAt.toISOString(),
      duplicateOf: dup ? { id: dup.uid, name: dup.name, phone: dup.phone } : null,
    };
  });
}

export type ClaimRow = {
  id: number;
  member_id: number;
  name: string;
  phone: string;
  photo: string | null;
  amount_paise: number;
  paid_on: string;
  method: Method;
  reference: string | null;
  note: string | null;
  status: "pending" | "confirmed" | "rejected";
  payment_id: number | null;
  reject_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export async function claims(status: "pending" | "reviewed", limit = 50): Promise<ClaimRow[]> {
  const rows = await (await db()).claims
    .find(status === "pending" ? { status: "pending" } : { status: { $ne: "pending" } }, { sort: status === "pending" ? { created_at: 1 } : { reviewed_at: -1 }, limit })
    .toArray();
  const who = await people(rows.map((c) => c.member_id));
  return rows.map(({ _id, ...c }) => ({ id: _id, ...c, name: who.get(c.member_id)?.name ?? "", phone: who.get(c.member_id)?.phone ?? "", photo: who.get(c.member_id)?.photo ?? null }));
}

export async function claimsFor(memberId: number): Promise<ClaimRow[]> {
  const rows = await (await db()).claims.find({ member_id: memberId }, { sort: { created_at: -1 } }).toArray();
  return rows.map(({ _id, ...c }) => ({ id: _id, ...c, name: "", phone: "", photo: null }));
}

export async function profile(memberId: number) {
  const u = await (await db()).users.findOne({ uid: memberId, role: "member", status: "approved" });
  if (!u?.billing_start_month) return undefined;
  return {
    id: u.uid,
    name: u.name,
    phone: u.phone,
    photo: u.photo ?? null,
    language: u.language,
    created_at: u.createdAt.toISOString(),
    reviewed_at: u.reviewed_at!,
    billing_start_month: u.billing_start_month,
    followup_opt_in: u.followup_opt_in ?? 1,
    admin_note: u.admin_note ?? null,
  };
}

/** Whether the id belongs to an approved (or once approved) member. */
export async function isMember(memberId: number): Promise<boolean> {
  return !!(await (await db()).users.findOne({ uid: memberId, role: "member", billing_start_month: { $type: "string" } }, { projection: { _id: 1 } }));
}

export async function setFollowupOptIn(memberId: number, on: boolean) {
  await (await db()).users.updateOne({ uid: memberId, role: "member" }, { $set: { followup_opt_in: on ? 1 : 0 } });
}

export type PaymentRow = {
  id: number;
  amount_paise: number;
  paid_on: string;
  method: Method;
  reference: string | null;
  note: string | null;
  created_at: string;
  reversed_at: string | null;
  reversal_reason: string | null;
  unallocated_paise: number;
  claim_id: number | null;
  months: string | null; // comma list of period months covered
  other_allocated: number; // allocated to opening/manual charges
};

export async function paymentsFor(memberId: number): Promise<PaymentRow[]> {
  const [{ payments, charges, allocations }, linked] = await all(
    () => ledger(memberId),
    async () => (await db()).claims.find({ member_id: memberId, payment_id: { $ne: null } }, { projection: { payment_id: 1 } }).toArray(),
  );
  const charge = new Map(charges.map((c) => [c.id, c]));
  const claimOf = new Map(linked.map((c) => [c.payment_id!, c._id]));
  const allocsOf = groupBy(allocations, (a) => a.payment_id);
  return payments
    .sort((a, b) => b.paid_on.localeCompare(a.paid_on) || b.id - a.id)
    .map((p) => {
      const as = allocsOf.get(p.id) ?? [];
      const months = as.map((a) => charge.get(a.charge_id)).filter((c) => c?.kind === "monthly").map((c) => c!.period_month!);
      return {
        id: p.id,
        amount_paise: p.amount_paise,
        paid_on: p.paid_on,
        method: p.method,
        reference: p.reference,
        note: p.note,
        created_at: p.created_at,
        reversed_at: p.reversed_at,
        reversal_reason: p.reversal_reason,
        unallocated_paise: p.unallocated_paise,
        claim_id: claimOf.get(p.id) ?? null,
        months: months.length ? months.join(",") : null,
        other_allocated: sum(as.filter((a) => charge.get(a.charge_id)?.kind !== "monthly").map((a) => a.amount_paise)),
      };
    });
}

export type WaiverRow = { id: number; charge_id: number; amount_paise: number; reason: string; source: "admin" | "status"; created_at: string; reversed_at: string | null };
export async function waiversFor(memberId: number): Promise<WaiverRow[]> {
  const rows = await (await db()).waivers.find({ member_id: memberId }, { sort: { _id: 1 } }).toArray();
  return rows.map((w) => ({ id: w._id, charge_id: w.charge_id, amount_paise: w.amount_paise, reason: w.reason, source: w.source, created_at: w.created_at, reversed_at: w.reversed_at }));
}

export async function statusHistory(memberId: number) {
  const rows = (await loadStatuses(memberId)).get(memberId) ?? [];
  return rows.map((r) => ({ id: r._id, status: r.status, effective_month: r.effective_month, reason: r.reason, created_at: r.created_at }));
}

export async function remindersFor(memberId: number) {
  const rows = await (await db()).reminder_opens.find({ member_id: memberId }, { sort: { _id: -1 }, limit: 20 }).toArray();
  return rows.map((r) => ({ id: r._id, kind: r.kind, language: r.language, opened_at: r.opened_at }));
}

export async function lastReminder(memberId: number, kind: string): Promise<string | null> {
  return (await (await db()).reminder_opens.findOne({ member_id: memberId, kind: kind as "fee" }, { sort: { opened_at: -1 } }))?.opened_at ?? null;
}

export async function lastReminders(kind: string): Promise<Map<number, string>> {
  const rows = await (await db()).reminder_opens.aggregate<{ _id: number; at: string }>([{ $match: { kind } }, { $group: { _id: "$member_id", at: { $max: "$opened_at" } } }]).toArray();
  return new Map(rows.map((r) => [r._id, r.at]));
}

export async function helpRequests(open: boolean) {
  const rows = await (await db()).help_requests
    .find(open ? { status: { $ne: "resolved" } } : { status: "resolved" }, open ? { sort: { created_at: 1 } } : { sort: { resolved_at: -1 }, limit: 20 })
    .toArray();
  if (open) rows.sort((a, b) => Number(a.status === "acknowledged") - Number(b.status === "acknowledged")); // stable: oldest first within each
  const who = await people(rows.map((h) => h.member_id));
  return rows.map((h) => ({
    id: h._id,
    member_id: h.member_id,
    name: who.get(h.member_id)?.name ?? "",
    phone: who.get(h.member_id)?.phone ?? "",
    photo: who.get(h.member_id)?.photo ?? null,
    language: (who.get(h.member_id)?.language ?? "en") as Lang,
    topic: h.topic,
    message: h.message,
    status: h.status,
    created_at: h.created_at,
    admin_note: h.admin_note,
  }));
}

export async function helpFor(memberId: number) {
  const rows = await (await db()).help_requests.find({ member_id: memberId }, { sort: { _id: -1 }, limit: 20 }).toArray();
  return rows.map((h) => ({ id: h._id, topic: h.topic, message: h.message, status: h.status, created_at: h.created_at, admin_note: h.admin_note }));
}

export async function feeSchedule() {
  return (await (await db()).fee_schedule.find({}, { sort: { _id: -1 } }).toArray()).map((f) => ({ effective_month: f._id, amount_paise: f.amount_paise }));
}

/** Months the approval sheet can offer as a billing start: launch month (or a year back) to next month. */
export function startMonthOptions(launch: string | undefined): string[] {
  const now = currentMonth();
  const first = launch && launch <= now ? launch : addMonths(now, -1);
  const out: string[] = [];
  for (let m = addMonths(now, 1); m >= first && out.length < 13; m = addMonths(m, -1)) out.push(m);
  return out;
}

/** This month's fees: what was billed (after waivers) and how much of it is paid. */
export async function monthFees(month = currentMonth()) {
  const cs = (await screenLedger()).charges.filter((c) => c.kind === "monthly" && c.period_month === month);
  return { billed: sum(cs.map((c) => c.amount_paise - c.waived_paise)), paid: sum(cs.map((c) => c.paid_paise)), charges: cs.length };
}

export async function visitsOn(date: string) {
  const rows = await (await db()).attendance.find({ visit_date: date }, { sort: { recorded_at: -1 } }).toArray();
  const who = await people(rows.map((a) => a.member_id));
  return rows.map((a) => ({ id: a.member_id, name: who.get(a.member_id)?.name ?? "", photo: who.get(a.member_id)?.photo ?? null, recorded_at: a.recorded_at }));
}

// ───────────────────────────── exports ─────────────────────────────

export const EXPORT_MONEY: Record<string, string[]> = {
  members: ["outstanding", "credit"],
  charges: ["amount", "paid", "waived", "outstanding"],
  payments: ["amount", "credit"],
  claims: ["amount"],
  attendance: [],
};

/** Rows for the admin CSV exports (same columns as before the move to MongoDB). */
export async function exportRows(kind: string): Promise<Record<string, unknown>[] | null> {
  const d = await db();
  const month = currentMonth();
  if (kind === "members") {
    const [members, statuses, { charges, payments }] = await all(
      () => d.users.find({ role: "member", billing_start_month: { $type: "string" } }).toArray(),
      () => loadStatuses(),
      () => ledger(),
    );
    return members.sort(byName).map((u) => ({
      id: u.uid,
      name: u.name,
      phone: u.phone,
      language: u.language,
      registered_at: u.createdAt.toISOString(),
      approved_at: u.reviewed_at ?? null,
      billing_start_month: u.billing_start_month,
      status: statusRowIn(statuses.get(u.uid), month)?.status ?? null,
      outstanding: sum(charges.filter((c) => c.member_id === u.uid).map((c) => c.outstanding)),
      credit: sum(payments.filter((p) => p.member_id === u.uid && !p.reversed_at).map((p) => p.unallocated_paise)),
      followup_opt_in: u.followup_opt_in ?? 1,
    }));
  }
  if (kind === "charges") {
    const { charges } = await ledger();
    const who = await people(charges.map((c) => c.member_id));
    return charges
      .sort((a, b) => a.member_id - b.member_id || a.due_date.localeCompare(b.due_date))
      .map((c) => ({
        id: c.id,
        member: who.get(c.member_id)?.name ?? "",
        phone: who.get(c.member_id)?.phone ?? "",
        kind: c.kind,
        month: c.period_month,
        amount: c.amount_paise,
        paid: c.paid_paise,
        waived: c.waived_paise,
        outstanding: c.outstanding,
        due_date: c.due_date,
        description: c.description,
        created_at: c.created_at,
      }));
  }
  if (kind === "payments") {
    const [{ payments, charges, allocations }, linked] = await all(
      () => ledger(),
      () => d.claims.find({ payment_id: { $ne: null } }, { projection: { payment_id: 1 } }).toArray(),
    );
    const who = await people(payments.map((p) => p.member_id));
    const charge = new Map(charges.map((c) => [c.id, c]));
    const allocsOf = groupBy(allocations, (a) => a.payment_id);
    const claimOf = new Map(linked.map((c) => [c.payment_id!, c._id]));
    return payments
      .sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.id - b.id)
      .map((p) => ({
        id: p.id,
        member: who.get(p.member_id)?.name ?? "",
        phone: who.get(p.member_id)?.phone ?? "",
        amount: p.amount_paise,
        paid_on: p.paid_on,
        method: p.method,
        reference: p.reference,
        note: p.note,
        covers: (allocsOf.get(p.id) ?? []).map((a) => charge.get(a.charge_id)?.period_month ?? charge.get(a.charge_id)?.kind ?? "").join(" ") || null,
        credit: p.unallocated_paise,
        recorded_at: p.created_at,
        reversed_at: p.reversed_at,
        reversal_reason: p.reversal_reason,
        claim_id: claimOf.get(p.id) ?? null,
      }));
  }
  if (kind === "claims") {
    const rows = await d.claims.find({}, { sort: { _id: 1 } }).toArray();
    const who = await people(rows.map((c) => c.member_id));
    return rows.map((k) => ({
      id: k._id,
      member: who.get(k.member_id)?.name ?? "",
      phone: who.get(k.member_id)?.phone ?? "",
      amount: k.amount_paise,
      paid_on: k.paid_on,
      method: k.method,
      reference: k.reference,
      note: k.note,
      status: k.status,
      payment_id: k.payment_id,
      reject_reason: k.reject_reason,
      created_at: k.created_at,
      reviewed_at: k.reviewed_at,
    }));
  }
  if (kind === "attendance") {
    const rows = await d.attendance.find({}).toArray();
    const who = await people(rows.map((a) => a.member_id));
    return rows
      .map((a) => ({ member: who.get(a.member_id)?.name ?? "", phone: who.get(a.member_id)?.phone ?? "", visit_date: a.visit_date, source: a.source, recorded_at: a.recorded_at }))
      .sort((a, b) => a.visit_date.localeCompare(b.visit_date) || byName({ name: a.member }, { name: b.member }));
  }
  return null;
}
