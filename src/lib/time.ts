// All calendar logic runs in Asia/Kolkata. Dates are 'YYYY-MM-DD', months 'YYYY-MM'.
export const TZ = "Asia/Kolkata";

const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export const todayIST = (now = new Date()) => ymd.format(now);
export const monthOf = (date: string) => date.slice(0, 7);
export const currentMonth = (now = new Date()) => monthOf(todayIST(now));

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export const daysInMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

export function dueDateFor(month: string, dueDay: number): string {
  const day = Math.min(Math.max(dueDay, 1), daysInMonth(month));
  return `${month}-${String(day).padStart(2, "0")}`;
}

export const isMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
// Rejects dates that don't exist (e.g. 2026-02-30), which Date.parse would silently roll over.
export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Asia/Kolkata calendar date of a UTC timestamp. */
export const istDate = (iso: string) => todayIST(new Date(iso));
