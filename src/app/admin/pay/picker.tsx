"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { ChevronRight, Hourglass, Search } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Avatar, Badge, cx } from "@/components/ui";
import { money } from "@/lib/format";

type Row = { id: number; name: string; digits: string; owes: number; overdue: boolean; claims: number };

export function MemberPicker({ rows }: { rows: Row[] }) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q).trim().toLowerCase();
  const digits = dq.replace(/\D/g, "");
  const shown = rows.filter((r) => !dq || r.name.toLowerCase().includes(dq) || (digits.length >= 3 && r.digits.includes(digits)));
  return (
    <>
      <label className="relative mb-3 block">
        <span className="sr-only">{t("pay.pickMember")}</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-500" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("directory.searchPlaceholder")}
          className="block min-h-14 w-full rounded-[16px] border border-sand-300 bg-white pl-11 pr-4 text-[17px] placeholder:text-ink-400 focus:border-ink-900 focus:outline-none focus:ring-4 focus:ring-volt/40"
        />
      </label>
      <ul className="divide-y divide-sand-200 overflow-hidden rounded-[var(--radius-xl)] border border-sand-200 bg-sand-0">
        {shown.map((r) => (
          <li key={r.id}>
            <Link href={`/admin/pay?m=${r.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5 transition hover:bg-sand-50 active:bg-sand-100">
              <Avatar name={r.name} size="sm" tone={r.overdue ? "ink" : "sand"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink-950">{r.name}</span>
                {r.claims > 0 && (
                  <Badge tone="info" icon={Hourglass}>
                    {t("directory.claimFlag")}
                  </Badge>
                )}
              </span>
              <span className={cx("font-display text-[18px] font-bold tabular", r.owes ? (r.overdue ? "text-bad" : "text-ink-950") : "text-[14px] font-sans font-medium text-ink-500")}>
                {r.owes ? money(r.owes, lang) : t("directory.settled")}
              </span>
              <ChevronRight className="size-5 text-ink-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
