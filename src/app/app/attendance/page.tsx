import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Leaf } from "lucide-react";
import { VisitCalendar } from "@/components/calendar";
import { GoalPicker } from "@/components/member/widgets";
import { Bar, Card, PageHeader, SectionTitle, cx } from "@/components/ui";
import { GOAL_OPTIONS, goalFor, visitDates } from "@/lib/engage";
import { fmtMonth } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { profile } from "@/lib/queries";
import { requireMember } from "@/lib/session";
import { addMonths, isMonth, todayIST } from "@/lib/time";

export const metadata: Metadata = { title: "Visits" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const me = await requireMember();
  const { t, lang } = await getT();
  const today = todayIST();
  const now = today.slice(0, 7);
  const first = profile(me.id)!.billing_start_month;
  const req = (await searchParams).m ?? now;
  const month = isMonth(req) && req <= now && req >= first ? req : now;
  const visits = visitDates(me.id, month);
  const goal = goalFor(me.id, month);
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const nav = (m: string, ok: boolean, label: string, Icon: typeof ChevronLeft) =>
    ok ? (
      <Link href={`?m=${m}`} replace aria-label={label} className="grid size-11 place-items-center rounded-full bg-sand-100 text-ink-800 transition hover:bg-sand-200">
        <Icon className="size-5" aria-hidden />
      </Link>
    ) : (
      <span aria-hidden className="grid size-11 place-items-center rounded-full text-ink-300">
        <Icon className="size-5" />
      </span>
    );

  return (
    <>
      <PageHeader title={t("attendance.title")} sub={t("attendance.sub")} />
      <div className="lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-8">
      <Card className="p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          {nav(prev, prev >= first, t("attendance.prev"), ChevronLeft)}
          <h2 className="font-display text-[24px] font-bold text-ink-950">{fmtMonth(month, lang, "long")}</h2>
          {nav(next, next <= now, t("attendance.next"), ChevronRight)}
        </div>
        <VisitCalendar month={month} visits={visits} today={today} lang={lang} label={t("attendance.calendarLabel", { month: fmtMonth(month, lang, "long") })} visitedLabel={t("attendance.visited")} todayLabel={t("attendance.todayLabel")} />
        <div className="mt-5 border-t border-sand-200 pt-4">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="font-display text-[34px] font-extrabold leading-none tabular text-ink-950">{t("attendance.total", { n: visits.length })}</p>
            <p className={cx("text-[15px] font-semibold", visits.length >= goal.target ? "text-ok" : "text-ink-600")}>{t("attendance.goalLine", { n: goal.target })}</p>
          </div>
          <Bar value={visits.length} max={goal.target} label={t("member.progress", { done: visits.length, target: goal.target })} />
        </div>
      </Card>

      <div>
      <p className="mt-4 flex items-start gap-2.5 rounded-[16px] bg-volt-soft lg:mt-0 px-4 py-3 text-[15px] text-volt-ink">
        <Leaf className="mt-0.5 size-5 shrink-0" aria-hidden />
        {t("attendance.restNote")}
      </p>

      {month === now && (
        <>
          <SectionTitle>{t("attendance.chooseGoal")}</SectionTitle>
          <Card className="p-4">
            <p className="mb-3 text-[14px] text-ink-600">{t("attendance.chooseGoalHelp")}</p>
            <GoalPicker options={GOAL_OPTIONS} current={goal.target} />
          </Card>
        </>
      )}
      </div>
      </div>
    </>
  );
}
