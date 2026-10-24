import { audit, db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { currentMonth, todayIST } from "@/lib/time";

// Admin-only record exports. CSV starts with a BOM so Excel shows Marathi/Hindi names correctly.
const R = (p: number | null) => (p == null ? "" : (p / 100).toFixed(2));

const QUERIES: Record<string, { sql: string; money?: string[] }> = {
  members: {
    sql: `SELECT u.id, u.name, u.phone, u.language, u.created_at AS registered_at, u.reviewed_at AS approved_at, m.billing_start_month,
            (SELECT status FROM membership_status s WHERE s.member_id = u.id AND s.effective_month <= :month ORDER BY effective_month DESC, id DESC LIMIT 1) AS status,
            COALESCE((SELECT SUM(amount_paise - paid_paise - waived_paise) FROM charge_balances c WHERE c.member_id = u.id), 0) AS outstanding,
            COALESCE((SELECT SUM(unallocated_paise) FROM payment_balances p WHERE p.member_id = u.id AND reversed_at IS NULL), 0) AS credit,
            m.followup_opt_in
          FROM users u JOIN members m ON m.user_id = u.id ORDER BY u.name`,
    money: ["outstanding", "credit"],
  },
  charges: {
    sql: `SELECT c.id, u.name AS member, u.phone, c.kind, c.period_month AS month, c.amount_paise AS amount, c.paid_paise AS paid, c.waived_paise AS waived,
            c.amount_paise - c.paid_paise - c.waived_paise AS outstanding, c.due_date, c.description, c.created_at
          FROM charge_balances c JOIN users u ON u.id = c.member_id ORDER BY c.member_id, c.due_date`,
    money: ["amount", "paid", "waived", "outstanding"],
  },
  payments: {
    sql: `SELECT p.id, u.name AS member, u.phone, p.amount_paise AS amount, p.paid_on, p.method, p.reference, p.note,
            (SELECT GROUP_CONCAT(COALESCE(c.period_month, c.kind), ' ') FROM allocations a JOIN charges c ON c.id = a.charge_id WHERE a.payment_id = p.id) AS covers,
            p.unallocated_paise AS credit, p.created_at AS recorded_at, p.reversed_at, p.reversal_reason,
            (SELECT id FROM claims WHERE payment_id = p.id) AS claim_id
          FROM payment_balances p JOIN users u ON u.id = p.member_id ORDER BY p.paid_on, p.id`,
    money: ["amount", "credit"],
  },
  claims: {
    sql: `SELECT k.id, u.name AS member, u.phone, k.amount_paise AS amount, k.paid_on, k.method, k.reference, k.note, k.status, k.payment_id, k.reject_reason, k.created_at, k.reviewed_at
          FROM claims k JOIN users u ON u.id = k.member_id ORDER BY k.id`,
    money: ["amount"],
  },
  attendance: {
    sql: `SELECT u.name AS member, u.phone, a.visit_date, a.source, a.recorded_at FROM attendance a JOIN users u ON u.id = a.member_id ORDER BY a.visit_date, u.name`,
  },
};

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formulas and quote everything.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  const admin = await requireAdmin();
  const { kind } = await params;
  const stamp = todayIST();

  if (kind === "backup") {
    audit(admin.id, "export.backup");
    return new Response(new Uint8Array(db().serialize()), {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="vihan-fitness-backup-${stamp}.db"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const q = QUERIES[kind];
  if (!q) return new Response("Not found", { status: 404 });
  const rows = db().prepare(q.sql).all({ month: currentMonth() }) as Record<string, unknown>[];
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const lines = [cols.map(cell).join(","), ...rows.map((r) => cols.map((c) => cell(q.money?.includes(c) ? R(r[c] as number) : r[c])).join(","))];
  audit(admin.id, "export.csv", { detail: { kind, rows: rows.length } });
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vihan-${kind}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
