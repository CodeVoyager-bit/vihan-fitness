// Read models for screens. Every caller is already behind requireAdmin()/requireMember().
import { db } from "./db";
import { statusAt, type MemberStatus, type Method } from "./ledger";
import { addMonths, currentMonth, monthOf, todayIST } from "./time";

export type MonthState = "paid" | "part" | "unpaid" | "overdue" | "waived" | "none" | "notStarted";

export type DirRow = {
  id: number;
  name: string;
  phone: string;
  language: "en" | "mr" | "hi";
  billing_start_month: string;
  followup_opt_in: number;
  status: MemberStatus;
  outstanding: number;
  overdue: number;
  credit: number;
  pending_claims: number;
  last_visit: string | null;
  m_amount: number | null;
  m_paid: number | null;
  m_waived: number | null;
  m_due: string | null;
  next_status: MemberStatus | null;
  next_month: string | null;
};

export function directory(today = todayIST()): DirRow[] {
  const month = monthOf(today);
  return db()
    .prepare(
      `SELECT u.id, u.name, u.phone, u.language, m.billing_start_month, m.followup_opt_in,
        (SELECT status FROM membership_status s WHERE s.member_id = u.id AND s.effective_month <= :month ORDER BY effective_month DESC, id DESC LIMIT 1) AS status,
        (SELECT status FROM membership_status s WHERE s.member_id = u.id AND s.effective_month > :month ORDER BY effective_month, id DESC LIMIT 1) AS next_status,
        (SELECT effective_month FROM membership_status s WHERE s.member_id = u.id AND s.effective_month > :month ORDER BY effective_month LIMIT 1) AS next_month,
        COALESCE((SELECT SUM(amount_paise - paid_paise - waived_paise) FROM charge_balances c WHERE c.member_id = u.id), 0) AS outstanding,
        COALESCE((SELECT SUM(amount_paise - paid_paise - waived_paise) FROM charge_balances c WHERE c.member_id = u.id AND c.due_date < :today), 0) AS overdue,
        COALESCE((SELECT SUM(unallocated_paise) FROM payment_balances p WHERE p.member_id = u.id AND p.reversed_at IS NULL), 0) AS credit,
        (SELECT COUNT(*) FROM claims k WHERE k.member_id = u.id AND k.status = 'pending') AS pending_claims,
        (SELECT MAX(visit_date) FROM attendance a WHERE a.member_id = u.id) AS last_visit,
        c.amount_paise AS m_amount, c.paid_paise AS m_paid, c.waived_paise AS m_waived, c.due_date AS m_due
       FROM users u JOIN members m ON m.user_id = u.id
       LEFT JOIN charge_balances c ON c.member_id = u.id AND c.kind = 'monthly' AND c.period_month = :month
       WHERE u.status = 'approved'
       ORDER BY u.name COLLATE NOCASE`,
    )
    .all({ month, today }) as DirRow[];
}

export function monthState(r: Pick<DirRow, "status" | "billing_start_month" | "m_amount" | "m_paid" | "m_waived" | "m_due">, today = todayIST()): MonthState {
  const month = monthOf(today);
  if (r.m_amount == null) return r.status === "active" && r.billing_start_month > month ? "notStarted" : "none";
  const left = r.m_amount - (r.m_paid ?? 0) - (r.m_waived ?? 0);
  if (left <= 0) return (r.m_paid ?? 0) > 0 ? "paid" : "waived";
  if ((r.m_paid ?? 0) > 0) return "part";
  return r.m_due && r.m_due < today ? "overdue" : "unpaid";
}

export function dashboard(today = todayIST()) {
  const month = monthOf(today);
  const q = <T,>(sql: string, ...p: unknown[]) => db().prepare(sql).get(...p) as T;
  const received = q<{ s: number; n: number }>(
    "SELECT COALESCE(SUM(amount_paise), 0) AS s, COUNT(*) AS n FROM payments WHERE reversed_at IS NULL AND paid_on LIKE ?",
    `${month}-%`,
  );
  const owed = q<{ s: number; n: number }>(
    `SELECT COALESCE(SUM(o), 0) AS s, COUNT(*) AS n FROM (SELECT member_id, SUM(amount_paise - paid_paise - waived_paise) AS o FROM charge_balances GROUP BY member_id HAVING o > 0)`,
  );
  const overdue = q<{ s: number; n: number }>(
    `SELECT COALESCE(SUM(o), 0) AS s, COUNT(*) AS n FROM (SELECT member_id, SUM(amount_paise - paid_paise - waived_paise) AS o FROM charge_balances WHERE due_date < ? GROUP BY member_id HAVING o > 0)`,
    today,
  );
  const counts = q<{ claims: number; approvals: number; help: number }>(
    `SELECT (SELECT COUNT(*) FROM claims WHERE status = 'pending') AS claims,
            (SELECT COUNT(*) FROM users WHERE role = 'member' AND status = 'pending') AS approvals,
            (SELECT COUNT(*) FROM help_requests WHERE status = 'open') AS help`,
  );
  const ids = db().prepare("SELECT user_id FROM members m JOIN users u ON u.id = m.user_id WHERE u.status = 'approved'").all() as { user_id: number }[];
  const active = ids.filter((r) => statusAt(r.user_id, month) === "active").length;
  return { received: received.s, receivedCount: received.n, outstanding: owed.s, outstandingMembers: owed.n, overdue: overdue.s, overdueMembers: overdue.n, active, ...counts };
}

export const inboxCounts = () =>
  db()
    .prepare(
      `SELECT (SELECT COUNT(*) FROM claims WHERE status = 'pending') AS claims,
              (SELECT COUNT(*) FROM users WHERE role = 'member' AND status = 'pending') AS approvals,
              (SELECT COUNT(*) FROM help_requests WHERE status = 'open') AS help`,
    )
    .get() as { claims: number; approvals: number; help: number };

export type ActivityRow = { id: number; at: string; action: string; member_id: number | null; member: string | null; detail: string | null; actor: string | null; actor_role: string | null };

export function activity(limit = 12, memberId?: number): ActivityRow[] {
  return db()
    .prepare(
      `SELECT a.id, a.at, a.action, a.member_id, mu.name AS member, a.detail, au.name AS actor, au.role AS actor_role
       FROM audit a LEFT JOIN users mu ON mu.id = a.member_id LEFT JOIN users au ON au.id = a.actor_id
       ${memberId ? "WHERE a.member_id = ?" : "WHERE a.action <> 'billing.generated'"}
       ORDER BY a.id DESC LIMIT ?`,
    )
    .all(...(memberId ? [memberId, limit] : [limit])) as ActivityRow[];
}

export function pendingRegistrations() {
  const rows = db()
    .prepare("SELECT id, name, phone, language, created_at FROM users WHERE role = 'member' AND status = 'pending' ORDER BY created_at")
    .all() as { id: number; name: string; phone: string; language: "en" | "mr" | "hi"; created_at: string }[];
  const existing = db().prepare("SELECT id, name, phone FROM users WHERE role = 'member' AND status = 'approved'").all() as { id: number; name: string; phone: string }[];
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}]/gu, "");
  return rows.map((r) => ({ ...r, duplicateOf: existing.find((e) => norm(e.name) === norm(r.name)) ?? null }));
}

export type ClaimRow = {
  id: number;
  member_id: number;
  name: string;
  phone: string;
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

export function claims(status: "pending" | "reviewed", limit = 50): ClaimRow[] {
  return db()
    .prepare(
      `SELECT c.*, u.name, u.phone FROM claims c JOIN users u ON u.id = c.member_id
       WHERE ${status === "pending" ? "c.status = 'pending' ORDER BY c.created_at" : "c.status <> 'pending' ORDER BY c.reviewed_at DESC"} LIMIT ?`,
    )
    .all(limit) as ClaimRow[];
}

export const claimsFor = (memberId: number) =>
  db().prepare("SELECT c.*, '' AS name, '' AS phone FROM claims c WHERE member_id = ? ORDER BY created_at DESC").all(memberId) as ClaimRow[];

export function profile(memberId: number) {
  return db()
    .prepare(
      `SELECT u.id, u.name, u.phone, u.language, u.created_at, u.reviewed_at, m.billing_start_month, m.followup_opt_in, m.admin_note
       FROM users u JOIN members m ON m.user_id = u.id WHERE u.id = ? AND u.status = 'approved'`,
    )
    .get(memberId) as
    | { id: number; name: string; phone: string; language: "en" | "mr" | "hi"; created_at: string; reviewed_at: string; billing_start_month: string; followup_opt_in: number; admin_note: string | null }
    | undefined;
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

export function paymentsFor(memberId: number): PaymentRow[] {
  return db()
    .prepare(
      `SELECT p.id, p.amount_paise, p.paid_on, p.method, p.reference, p.note, p.created_at, p.reversed_at, p.reversal_reason, p.unallocated_paise,
        (SELECT id FROM claims WHERE payment_id = p.id) AS claim_id,
        (SELECT GROUP_CONCAT(c.period_month) FROM allocations a JOIN charges c ON c.id = a.charge_id WHERE a.payment_id = p.id AND c.kind = 'monthly') AS months,
        COALESCE((SELECT SUM(a.amount_paise) FROM allocations a JOIN charges c ON c.id = a.charge_id WHERE a.payment_id = p.id AND c.kind <> 'monthly'), 0) AS other_allocated
       FROM payment_balances p WHERE p.member_id = ? ORDER BY p.paid_on DESC, p.id DESC`,
    )
    .all(memberId) as PaymentRow[];
}

export type WaiverRow = { id: number; charge_id: number; amount_paise: number; reason: string; source: "admin" | "status"; created_at: string; reversed_at: string | null };
export const waiversFor = (memberId: number) =>
  db()
    .prepare("SELECT w.* FROM waivers w JOIN charges c ON c.id = w.charge_id WHERE c.member_id = ? ORDER BY w.id")
    .all(memberId) as WaiverRow[];

export const statusHistory = (memberId: number) =>
  db()
    .prepare("SELECT id, status, effective_month, reason, created_at FROM membership_status WHERE member_id = ? ORDER BY effective_month DESC, id DESC")
    .all(memberId) as { id: number; status: MemberStatus; effective_month: string; reason: string | null; created_at: string }[];

export const remindersFor = (memberId: number) =>
  db().prepare("SELECT id, kind, language, opened_at FROM reminder_opens WHERE member_id = ? ORDER BY id DESC LIMIT 20").all(memberId) as {
    id: number;
    kind: "fee" | "attendance" | "receipt";
    language: string;
    opened_at: string;
  }[];

export const lastReminder = (memberId: number, kind: string) =>
  (db().prepare("SELECT MAX(opened_at) AS at FROM reminder_opens WHERE member_id = ? AND kind = ?").get(memberId, kind) as { at: string | null }).at;

export function lastReminders(kind: string): Map<number, string> {
  const rows = db().prepare("SELECT member_id, MAX(opened_at) AS at FROM reminder_opens WHERE kind = ? GROUP BY member_id").all(kind) as { member_id: number; at: string }[];
  return new Map(rows.map((r) => [r.member_id, r.at]));
}

export function helpRequests(open: boolean) {
  return db()
    .prepare(
      `SELECT h.*, u.name, u.phone, u.language FROM help_requests h JOIN users u ON u.id = h.member_id
       WHERE ${open ? "h.status <> 'resolved' ORDER BY h.status = 'acknowledged', h.created_at" : "h.status = 'resolved' ORDER BY h.resolved_at DESC LIMIT 20"}`,
    )
    .all() as {
    id: number;
    member_id: number;
    name: string;
    phone: string;
    language: "en" | "mr" | "hi";
    topic: "routine" | "general";
    message: string | null;
    status: "open" | "acknowledged" | "resolved";
    created_at: string;
    admin_note: string | null;
  }[];
}

export const helpFor = (memberId: number) =>
  db().prepare("SELECT * FROM help_requests WHERE member_id = ? ORDER BY id DESC LIMIT 20").all(memberId) as {
    id: number;
    topic: "routine" | "general";
    message: string | null;
    status: "open" | "acknowledged" | "resolved";
    created_at: string;
    admin_note: string | null;
  }[];

export const feeSchedule = () =>
  db().prepare("SELECT effective_month, amount_paise FROM fee_schedule ORDER BY effective_month DESC").all() as { effective_month: string; amount_paise: number }[];

/** Months the approval sheet can offer as a billing start: launch month (or a year back) to next month. */
export function startMonthOptions(launch: string | undefined): string[] {
  const now = currentMonth();
  const first = launch && launch <= now ? launch : addMonths(now, -1);
  const out: string[] = [];
  for (let m = addMonths(now, 1); m >= first && out.length < 13; m = addMonths(m, -1)) out.push(m);
  return out;
}

/** This month's fees: what was billed (after waivers) and how much of it is paid. */
export function monthFees(month = currentMonth()) {
  return db()
    .prepare(
      `SELECT COALESCE(SUM(amount_paise - waived_paise), 0) AS billed, COALESCE(SUM(paid_paise), 0) AS paid, COUNT(*) AS charges
       FROM charge_balances WHERE kind = 'monthly' AND period_month = ?`,
    )
    .get(month) as { billed: number; paid: number; charges: number };
}

export const visitsOn = (date: string) =>
  db()
    .prepare("SELECT u.id, u.name, a.recorded_at FROM attendance a JOIN users u ON u.id = a.member_id WHERE a.visit_date = ? ORDER BY a.recorded_at DESC")
    .all(date) as { id: number; name: string; recorded_at: string }[];
