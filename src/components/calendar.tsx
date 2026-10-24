import { Check } from "lucide-react";
import { localeTag } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { daysInMonth } from "@/lib/time";
import { cx } from "./ui";

/** Month grid of recorded visits. Visited days get a filled disc *and* a check mark, so colour is never the only signal. */
export function VisitCalendar({ month, visits, today, lang, label, visitedLabel, todayLabel, compact }: { month: string; visits: string[]; today: string; lang: Lang; label: string; visitedLabel: string; todayLabel: string; compact?: boolean }) {
  const set = new Set(visits);
  const n = daysInMonth(month);
  const first = new Date(`${month}-01T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const lead = (first + 6) % 7; // weeks start on Monday
  const wk = new Intl.DateTimeFormat(localeTag(lang), { weekday: "narrow", timeZone: "UTC" });
  const longDay = new Intl.DateTimeFormat(localeTag(lang), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const heads = Array.from({ length: 7 }, (_, i) => wk.format(new Date(Date.UTC(2024, 0, 1 + i)))); // 1 Jan 2024 was a Monday
  const cells = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];

  return (
    <div role="grid" aria-label={label} className="select-none">
      <div role="row" className="mb-1 grid grid-cols-7 text-center text-[12px] font-semibold uppercase text-ink-500">
        {heads.map((h, i) => (
          <span role="columnheader" key={i} className="py-1">
            {h}
          </span>
        ))}
      </div>
      <div role="rowgroup" className={cx("grid grid-cols-7", compact ? "gap-1" : "gap-1.5")}>
        {cells.map((d, i) => {
          if (!d) return <span key={`b${i}`} aria-hidden />;
          const visited = set.has(d);
          const isToday = d === today;
          const future = d > today;
          const day = Number(d.slice(8));
          const desc = `${longDay.format(new Date(`${d}T00:00:00Z`))}${visited ? ` — ${visitedLabel}` : ""}${isToday ? ` (${todayLabel})` : ""}`;
          return (
            <span
              role="gridcell"
              key={d}
              aria-label={desc}
              className={cx(
                "relative grid aspect-square place-items-center rounded-full font-semibold tabular",
                compact ? "text-[13px]" : "text-[15px]",
                visited ? "bg-volt text-ink-950" : future ? "text-ink-300" : "text-ink-600",
                isToday && "ring-2 ring-ink-900 ring-offset-2 ring-offset-sand-0",
              )}
            >
              {day}
              {visited && (
                <span aria-hidden className="absolute -right-0.5 -top-0.5 grid size-[15px] place-items-center rounded-full bg-ink-950 text-volt">
                  <Check className="size-2.5" strokeWidth={4} />
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
