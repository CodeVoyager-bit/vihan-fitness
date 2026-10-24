import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { CheckInButton } from "@/components/member/widgets";
import { ButtonLink, ProgressRing } from "@/components/ui";
import { setting } from "@/lib/db";
import { goalFor, visitDates } from "@/lib/engage";
import { fmtWeekday } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { statusAt } from "@/lib/ledger";
import { requireMember } from "@/lib/session";
import { todayIST } from "@/lib/time";

export const metadata: Metadata = { title: "Check in" };

/** Target of the QR poster at the door. Sign-in comes first, then a one-tap confirm. */
export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const k = (await searchParams).k ?? "";
  const me = await requireMember(`/checkin?k=${encodeURIComponent(k)}`);
  const { t, lang } = await getT();
  const today = todayIST();
  const visits = visitDates(me.id, today.slice(0, 7));
  const goal = goalFor(me.id);
  const valid = k && k === setting("checkin_key");
  const active = statusAt(me.id, today.slice(0, 7)) === "active";

  return (
    <main id="main" className="dark-surface relative flex min-h-dvh flex-col items-center overflow-hidden bg-ink-950 px-5 pb-10 pt-[max(env(safe-area-inset-top),20px)] text-center text-sand-0">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 size-[480px] -translate-x-1/2 rounded-full bg-volt/25 blur-[120px]" />
      <Wordmark dark href="/app" className="relative" />
      <div className="relative mt-auto">
        <ProgressRing value={visits.length} max={goal.target} dark size={200} stroke={16} label={t("member.progress", { done: visits.length, target: goal.target })}>
          <span>
            <span className="block font-display text-[72px] font-extrabold leading-none tabular text-volt">{visits.length}</span>
            <span className="block text-[15px] font-semibold text-sand-0/70">/ {goal.target}</span>
          </span>
        </ProgressRing>
      </div>
      <h1 className="relative mt-6 font-display text-[44px] font-extrabold leading-[1.05]">{t("member.welcome", { name: me.name.split(" ")[0] })}</h1>
      <p className="relative mt-2 text-sand-0/75">{fmtWeekday(today, lang)}</p>
      <div className="relative mb-auto mt-8 w-full max-w-sm">
        {!valid ? (
          <p className="flex items-start gap-2 rounded-[16px] bg-white/10 p-4 text-left text-[15px]">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-volt" aria-hidden />
            {t("errors.checkinBadCode")}
          </p>
        ) : !active ? (
          <p className="rounded-[16px] bg-white/10 p-4 text-[15px]">{t("errors.checkinNotActive")}</p>
        ) : (
          <CheckInButton dateLabel={fmtWeekday(today, lang)} done={visits.includes(today)} qrKey={k} autoOpen={!visits.includes(today)} target={goal.target} />
        )}
      </div>
      <ButtonLink href="/app" variant="ghost" className="relative text-sand-0 hover:bg-white/10">
        {t("nav.home")}
      </ButtonLink>
    </main>
  );
}
