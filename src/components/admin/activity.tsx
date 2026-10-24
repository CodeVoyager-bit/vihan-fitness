import Link from "next/link";
import { BadgeCheck, CircleUserRound, Footprints, HandCoins, LifeBuoy, ReceiptText, RotateCcw, Settings2, Trophy, UserPlus, type LucideIcon } from "lucide-react";
import { fmtDateTime, money } from "@/lib/format";
import { type Lang, type T, tDynamic } from "@/lib/i18n";
import type { ActivityRow } from "@/lib/queries";
import { cx } from "../ui";

const ICONS: [string, LucideIcon, string][] = [
  ["payment.reversed", RotateCcw, "bg-bad-soft text-bad"],
  ["payment", HandCoins, "bg-volt-soft text-volt-ink"],
  ["claim", ReceiptText, "bg-info-soft text-info"],
  ["registration", UserPlus, "bg-sand-200 text-ink-700"],
  ["member", BadgeCheck, "bg-ok-soft text-ok"],
  ["charge", ReceiptText, "bg-warn-soft text-warn"],
  ["waiver", RotateCcw, "bg-warn-soft text-warn"],
  ["help", LifeBuoy, "bg-info-soft text-info"],
  ["visit", Footprints, "bg-sand-200 text-ink-700"],
  ["challenge", Trophy, "bg-volt-soft text-volt-ink"],
  ["settings", Settings2, "bg-sand-200 text-ink-700"],
  ["billing", ReceiptText, "bg-sand-200 text-ink-700"],
];

export function ActivityList({ rows, t, lang, linkMembers = true }: { rows: ActivityRow[]; t: T; lang: Lang; linkMembers?: boolean }) {
  return (
    <ol className="divide-y divide-sand-200">
      {rows.map((r) => {
        const [, Icon, tone] = ICONS.find(([p]) => r.action.startsWith(p)) ?? ["", CircleUserRound, "bg-sand-200 text-ink-700"];
        let amount = "";
        let reason = "";
        try {
          const d = r.detail ? JSON.parse(r.detail) : null;
          if (d && typeof d.amount === "number") amount = money(d.amount, lang);
          if (d && typeof d.reason === "string" && !d.reason.startsWith("status:")) reason = d.reason;
        } catch {}
        const text = tDynamic(t, `activity.${r.action.replace(".", "_")}`, "activity.other", { member: r.member ?? "", amount });
        const body = (
          <>
            <span className={cx("mt-0.5 grid size-9 shrink-0 place-items-center rounded-full", tone)}>
              <Icon className="size-[18px]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-snug text-ink-900">{text}</span>
              {reason && <span className="mt-0.5 block text-[14px] text-ink-600">“{reason}”</span>}
              <span className="mt-0.5 block text-[13px] text-ink-500 tabular">
                {fmtDateTime(r.at, lang)}
                {r.actor && r.actor_role === "member" && r.actor !== r.member ? ` · ${r.actor}` : ""}
              </span>
            </span>
          </>
        );
        return (
          <li key={r.id}>
            {linkMembers && r.member_id ? (
              <Link href={`/admin/members/${r.member_id}`} className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-3 transition hover:bg-sand-100">
                {body}
              </Link>
            ) : (
              <div className="flex items-start gap-3 py-3">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
