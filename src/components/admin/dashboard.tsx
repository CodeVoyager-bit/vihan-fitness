// Dashboard visuals: a single-series meter and a one-tile-per-member grid. Plain HTML, no chart library.
import Link from "next/link";
import { AlertTriangle, Check, CircleDot, Clock3, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MonthState } from "@/lib/queries";
import { cx } from "../ui";

/** Collected vs billed for the month. The track is a lighter step of the fill's ramp. */
export function Meter({ label, valueText, value, max }: { label: string; valueText: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[14px]">
        <span className="font-semibold text-sand-0">{label}</span>
        <span className="text-sand-0/75">
          {valueText} · <span className="font-semibold text-sand-0">{pct}%</span>
        </span>
      </div>
      <div role="meter" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${valueText}, ${pct}%`} className="mt-2 h-3 overflow-hidden rounded-full bg-volt/20">
        <div className="h-full rounded-full bg-volt" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Status is carried by icon *and* colour, so the grid reads without colour vision.
export const GRID_STATES: { key: MonthState | "none"; icon: LucideIcon; tile: string }[] = [
  { key: "overdue", icon: AlertTriangle, tile: "bg-bad text-white" },
  { key: "unpaid", icon: Clock3, tile: "bg-warn-soft text-warn ring-1 ring-inset ring-warn/30" },
  { key: "part", icon: CircleDot, tile: "bg-warn text-white" },
  { key: "paid", icon: Check, tile: "bg-ok text-white" },
  { key: "none", icon: Minus, tile: "bg-mute-soft text-mute" },
];

export type GridMember = { id: number; name: string; state: MonthState; stateLabel: string };

export function MemberGrid({ members, legend }: { members: GridMember[]; legend: Record<string, string> }) {
  const norm = (s: MonthState) => (s === "waived" || s === "notStarted" ? "none" : s);
  const order = GRID_STATES.map((g) => g.key);
  const sorted = [...members].sort((a, b) => order.indexOf(norm(a.state)) - order.indexOf(norm(b.state)) || a.name.localeCompare(b.name));
  const counts = Object.fromEntries(order.map((k) => [k, members.filter((m) => norm(m.state) === k).length]));
  return (
    <div>
      <ul className="relative grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1.5">
        {sorted.map((m) => {
          const g = GRID_STATES.find((x) => x.key === norm(m.state))!;
          return (
            <li key={m.id} className="group">
              <Link
                href={`/admin/members/${m.id}`}
                aria-label={`${m.name} — ${m.stateLabel}`}
                className={cx("grid aspect-square place-items-center rounded-[10px] transition hover:scale-105 focus-visible:scale-105", g.tile)}
              >
                <g.icon className="size-4" strokeWidth={2.6} aria-hidden />
              </Link>
              <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden max-w-full -translate-x-1/2 truncate whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-[13px] font-medium text-sand-0 shadow-[var(--shadow-lift)] group-hover:block group-focus-within:block">
                {m.name} · {m.stateLabel}
              </span>
            </li>
          );
        })}
      </ul>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-ink-700">
        {GRID_STATES.filter((g) => counts[g.key]).map((g) => (
          <li key={g.key} className="flex items-center gap-1.5">
            <span className={cx("grid size-4 place-items-center rounded-[5px]", g.tile)}>
              <g.icon className="size-2.5" strokeWidth={3} aria-hidden />
            </span>
            {legend[g.key]} <span className="font-semibold text-ink-950">{counts[g.key]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
