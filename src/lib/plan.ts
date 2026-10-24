// Pure allocation planning, shared by the payment form (live preview) and the server (authoritative).

export type OpenCharge = { id: number; month: string | null; outstanding: number; overdue: boolean; kind?: "monthly" | "opening" | "manual"; description?: string | null };
export type FutureMonth = { month: string; fee: number };
/** A line either pays an existing charge or a not-yet-billed month (the server creates that charge). */
export type PlanLine = { chargeId?: number; month: string | null; amount: number };
export type Plan = { lines: PlanLine[]; credit: number };

/** Default rule: oldest unpaid charge first, then whole upcoming months, remainder stays as advance credit. */
export function planAllocation(amount: number, open: OpenCharge[], future: FutureMonth[]): Plan {
  let left = amount;
  const lines: PlanLine[] = [];
  for (const c of open) {
    if (left <= 0) break;
    const take = Math.min(c.outstanding, left);
    lines.push({ chargeId: c.id, month: c.month, amount: take });
    left -= take;
  }
  for (const f of future) {
    if (left < f.fee) break;
    lines.push({ month: f.month, amount: f.fee });
    left -= f.fee;
  }
  return { lines, credit: left };
}

/** Checks an admin-chosen split. Returns an error code or null. Whatever is not allocated stays as credit. */
export function validatePlan(amount: number, lines: PlanLine[], open: OpenCharge[], future: FutureMonth[]): string | null {
  let total = 0;
  const seen = new Set<string>();
  for (const l of lines) {
    if (!Number.isInteger(l.amount) || l.amount <= 0) return "allocationInvalid";
    const key = l.chargeId ? `c${l.chargeId}` : `m${l.month}`;
    if (seen.has(key)) return "allocationInvalid";
    seen.add(key);
    if (l.chargeId) {
      const c = open.find((o) => o.id === l.chargeId);
      if (!c || l.amount > c.outstanding) return "allocationTooMuch";
    } else {
      // Upcoming months are paid whole; a partial advance stays as credit instead of creating debt early.
      const f = future.find((o) => o.month === l.month);
      if (!f || l.amount > f.fee) return "allocationTooMuch";
      if (l.amount !== f.fee) return "allocationWholeMonths";
    }
    total += l.amount;
  }
  return total > amount ? "allocationOverPayment" : null;
}
