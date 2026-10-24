"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { IndianRupee, MessageCircle, Phone, Search, SearchX, Hourglass } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Avatar, Badge, EmptyState, StatusBadge, cx } from "@/components/ui";
import { money } from "@/lib/format";
import type { MemberStatus } from "@/lib/ledger";
import type { MonthState } from "@/lib/queries";

export type DirItem = {
  id: number;
  name: string;
  photo: string | null;
  phone: string;
  digits: string;
  tel: string | null;
  wa: string | null;
  status: MemberStatus;
  outstanding: number;
  overdue: number;
  credit: number;
  claims: number;
  state: MonthState;
  stateLabel: string;
};

const FILTERS = ["all", "owes", "overdue", "claims", "active", "paused", "left"] as const;
type Filter = (typeof FILTERS)[number];
const match: Record<Filter, (r: DirItem) => boolean> = {
  all: (r) => r.status !== "left" || r.outstanding > 0,
  owes: (r) => r.outstanding > 0,
  overdue: (r) => r.overdue > 0,
  claims: (r) => r.claims > 0,
  active: (r) => r.status === "active",
  paused: (r) => r.status === "paused",
  left: (r) => r.status === "left",
};

export function Directory({ rows, initialFilter, initialQuery }: { rows: DirItem[]; initialFilter: string; initialQuery: string }) {
  const { t } = useI18n();
  const [q, setQ] = useState(initialQuery);
  const [f, setF] = useState<Filter>(FILTERS.includes(initialFilter as Filter) ? (initialFilter as Filter) : "all");
  const dq = useDeferredValue(q);
  // Keep the view shareable/back-button friendly: ?f=owes&q=ravi
  useEffect(() => {
    const u = new URL(location.href);
    u.searchParams.set("f", f);
    if (dq) u.searchParams.set("q", dq);
    else u.searchParams.delete("q");
    history.replaceState(history.state, "", u);
  }, [f, dq]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((k) => [k, rows.filter(match[k]).length])), [rows]);
  const shown = useMemo(() => {
    const needle = dq.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    return rows
      .filter(match[f])
      .filter((r) => !needle || r.name.toLowerCase().includes(needle) || (digits.length >= 3 && r.digits.includes(digits)))
      .sort((a, b) => (f === "owes" || f === "overdue" ? b.outstanding - a.outstanding : 0));
  }, [rows, f, dq]);

  return (
    <>
      <div className="sticky top-0 z-20 -mx-4 bg-sand-100/95 px-4 pb-3 pt-1 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <label className="relative block">
          <span className="sr-only">{t("common.search")}</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-500" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("directory.searchPlaceholder")}
            autoComplete="off"
            className="block min-h-12 w-full rounded-[14px] border border-sand-300 bg-white pl-11 pr-3.5 text-[16px] placeholder:text-ink-400 focus:border-ink-900 focus:outline-none focus:ring-4 focus:ring-volt/40"
          />
        </label>
        <div role="group" aria-label={t("common.status")} className="no-scrollbar -mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {FILTERS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={f === k}
              onClick={() => setF(k)}
              className={cx(
                "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-semibold transition",
                f === k ? "border-ink-950 bg-ink-950 text-sand-0" : "border-sand-300 bg-sand-0 text-ink-700 hover:border-ink-300",
              )}
            >
              {t(`directory.filters.${k}`)}
              <span className={cx("tabular text-[12px]", f === k ? "text-volt" : "text-ink-500")}>{counts[k]}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {t("directory.resultCount", { n: shown.length })}
      </p>

      {shown.length === 0 ? (
        <EmptyState icon={SearchX} title={rows.length ? t("directory.empty") : t("directory.emptyAll")} />
      ) : (
        <ul className="divide-y divide-sand-200 overflow-hidden rounded-[var(--radius-xl)] border border-sand-200 bg-sand-0 shadow-[var(--shadow-card)]">
          {shown.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-3.5 py-3 [contain-intrinsic-size:auto_84px] [content-visibility:auto] sm:items-center sm:px-4">
              <Link href={`/admin/members/${r.id}`} className="flex min-w-0 flex-1 items-start gap-3 rounded-xl sm:items-center">
                <Avatar name={r.name} photo={r.photo} tone={r.overdue ? "ink" : "sand"} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[16px] font-semibold text-ink-950">{r.name}</span>
                    <Amount r={r} />
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    {r.status !== "active" && <StatusBadge status={r.status} label={t(`memberStatus.${r.status}`)} />}
                    <StatusBadge status={r.state} label={r.stateLabel} />
                    {r.claims > 0 && (
                      <Badge tone="info" icon={Hourglass}>
                        {t("directory.claimFlag")}
                      </Badge>
                    )}
                  </span>
                </span>
              </Link>
              <div className="flex shrink-0 gap-1.5 self-center">
                <Link
                  href={`/admin/pay?m=${r.id}`}
                  aria-label={`${t("admin.recordPayment")}: ${r.name}`}
                  title={t("admin.recordPayment")}
                  className="hidden size-11 place-items-center rounded-full border border-sand-300 bg-sand-0 text-ink-900 transition hover:border-ink-900 active:scale-95 min-[360px]:grid"
                >
                  <IndianRupee className="size-5" aria-hidden />
                </Link>
                <a
                  href={r.tel ? `tel:${r.tel}` : undefined}
                  aria-disabled={!r.tel}
                  aria-label={`${t("common.call")}: ${r.name}`}
                  title={`${t("common.call")} ${r.phone}`}
                  className="hidden size-11 place-items-center rounded-full bg-sand-100 text-ink-800 transition hover:bg-sand-200 aria-disabled:opacity-40 min-[400px]:grid"
                >
                  <Phone className="size-[18px]" aria-hidden />
                </a>
                <Link
                  href={`/admin/members/${r.id}?wa=${r.outstanding > 0 ? "fee" : "attendance"}`}
                  aria-label={`${t("common.whatsapp")}: ${r.name}`}
                  title={t("common.whatsapp")}
                  className="grid size-11 place-items-center rounded-full bg-[#e3f6e8] text-[#126b3a] transition hover:bg-[#cdeed6] active:scale-95"
                >
                  <MessageCircle className="size-5" aria-hidden />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Amount({ r }: { r: DirItem }) {
  const { t, lang } = useI18n();
  if (r.outstanding > 0)
    return (
      <span className={cx("shrink-0 font-display text-[19px] font-bold tabular", r.overdue ? "text-bad" : "text-ink-950")}>
        {money(r.outstanding, lang)}
      </span>
    );
  if (r.credit > 0) return <span className="shrink-0 text-[14px] font-semibold text-ok tabular">+{money(r.credit, lang)}</span>;
  return <span className="shrink-0 text-[13px] font-medium text-ink-500">{t("directory.settled")}</span>;
}
