import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight, Footprints, HandCoins, Info, LifeBuoy, ReceiptText, UserCheck, UserPlus, type LucideIcon } from "lucide-react";
import { ActivityList } from "@/components/admin/activity";
import { Meter, MemberGrid } from "@/components/admin/dashboard";
import { LangSwitcher, WhatsAppSheet } from "@/components/client";
import { Avatar, ButtonLink, Card, Notice, cx } from "@/components/ui";
import { isDemo, setting } from "@/lib/db";
import { followUpCandidates } from "@/lib/engage";
import { fmtDate, fmtMonthName, fmtTime, money, relDay } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { attendanceMessages } from "@/lib/messages";
import { waNumber } from "@/lib/phone";
import { activity, claims, dashboard, directory, helpRequests, monthFees, monthState, pendingRegistrations, visitsOn } from "@/lib/queries";
import { requireAdmin } from "@/lib/session";
import { todayIST } from "@/lib/time";

export const metadata: Metadata = { title: "Today" };

export default async function AdminHome() {
  await requireAdmin();
  const { t, lang } = await getT();
  const today = todayIST();
  const month = today.slice(0, 7);
  const monthName = fmtMonthName(month, lang);
  const d = dashboard(today);
  const fees = monthFees(month);
  const rows = directory(today).filter((r) => r.status !== "left" || r.outstanding > 0);
  const follow = followUpCandidates(today).slice(0, 3);
  const feed = activity(8);
  const gym = visitsOn(today);
  const rel = (s: string) => relDay(s, today, t);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  const greeting = hour < 12 ? t("admin.greeting.morning") : hour < 17 ? t("admin.greeting.afternoon") : t("admin.greeting.evening");

  // The action queue: only things that are actually waiting.
  const queue: { href: string; icon: LucideIcon; n: number; title: string; detail: string; tone: "info" | "bad" }[] = [
    { href: "/admin/claims", icon: ReceiptText, n: d.claims, title: t("admin.claimsWaiting"), detail: claims("pending", 2).map((c) => `${c.name.split(" ")[0]} · ${money(c.amount_paise, lang)}`).join(", "), tone: "info" as const },
    { href: "/admin/approvals", icon: UserPlus, n: d.approvals, title: t("admin.approvalsWaiting"), detail: pendingRegistrations().slice(0, 2).map((r) => r.name).join(", "), tone: "info" as const },
    { href: "/admin/help", icon: LifeBuoy, n: d.help, title: t("admin.helpWaiting"), detail: helpRequests(true).filter((h) => h.status === "open").slice(0, 2).map((h) => h.name.split(" ")[0]).join(", "), tone: "info" as const },
    { href: "/admin/followup?tab=fees", icon: AlertTriangle, n: d.overdueMembers, title: t("admin.overdueFollowups"), detail: money(d.overdue, lang), tone: "bad" as const },
  ].filter((q) => q.n > 0);

  return (
    <>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-medium text-ink-500">{fmtDate(today, lang, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-0.5 text-balance font-display text-[30px] font-extrabold leading-[1] text-ink-950 sm:text-[36px]">{greeting}</h1>
        </div>
        <LangSwitcher className="lg:hidden" />
      </header>

      {!setting("launch_month") && (
        <div className="mb-4">
          <Notice tone="warn" action={<ButtonLink href="/admin/more" variant="dark" size="sm">{t("admin.setupAction")}</ButtonLink>}>
            <p className="font-semibold">{t("admin.setupTitle")}</p>
            <p>{t("admin.setupBody")}</p>
          </Notice>
        </div>
      )}

      {/* Mobile: one column in reading order. Desktop: money & members left, actions right. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-6">
        <div className="contents lg:flex lg:flex-col lg:gap-6">
          {/* Money — the one hero figure on the page. */}
          <section aria-labelledby="money-h" className="dark-surface relative order-1 overflow-hidden rounded-[var(--radius-2xl)] bg-ink-950 p-5 text-sand-0 shadow-[var(--shadow-lift)] sm:p-6 lg:order-none">
            <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-volt/15 blur-3xl" />
            <h2 id="money-h" className="relative flex items-center gap-2 text-[14px] font-semibold text-sand-0/75">
              <HandCoins className="size-4 text-volt" aria-hidden />
              {t("admin.collected", { month: monthName })}
            </h2>
            <p className="relative mt-1 font-display text-[56px] font-extrabold leading-none text-volt sm:text-[64px]">{money(d.received, lang)}</p>
            <p className="relative mt-1.5 flex items-start gap-1.5 text-[13px] leading-snug text-sand-0/65">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                {t("admin.receivedCount", { n: d.receivedCount })}. {t("admin.collectedNote")}
              </span>
            </p>
            <div className="relative mt-5">
              <Meter label={t("admin.feesMeter", { month: monthName })} valueText={t("admin.feesMeterValue", { paid: money(fees.paid, lang), billed: money(fees.billed, lang) })} value={fees.paid} max={fees.billed} />
            </div>
            <div className="relative mt-5 grid grid-cols-2 gap-2">
              <Link href="/admin/members?f=owes" className="rounded-[16px] bg-white/[0.06] p-3.5 transition hover:bg-white/10">
                <span className="block text-[13px] font-semibold text-sand-0/70">{t("admin.outstanding")}</span>
                <span className="mt-0.5 block font-display text-[26px] font-bold leading-tight">{money(d.outstanding, lang)}</span>
                <span className="block text-[13px] text-sand-0/60">{t("admin.membersCount", { n: d.outstandingMembers })}</span>
              </Link>
              <Link href="/admin/followup?tab=fees" className="rounded-[16px] bg-white/[0.06] p-3.5 transition hover:bg-white/10">
                <span className="flex items-center gap-1 text-[13px] font-semibold text-sand-0/70">
                  {d.overdue > 0 && <AlertTriangle className="size-3.5 text-[#ff8a7a]" aria-hidden />}
                  {t("admin.overdue")}
                </span>
                <span className={cx("mt-0.5 block font-display text-[26px] font-bold leading-tight", d.overdue > 0 && "text-[#ff8a7a]")}>{money(d.overdue, lang)}</span>
                <span className="block text-[13px] text-sand-0/60">{t("admin.afterDue", { day: setting("due_day") ?? "10" })}</span>
              </Link>
            </div>
          </section>

          {/* Every member, one tile each. */}
          <Card className="order-4 p-4 sm:p-5 lg:order-none" aria-labelledby="glance-h">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="glance-h" className="font-display text-[22px] font-bold text-ink-950">
                {t("admin.glance", { month: monthName })}
              </h2>
              <Link href="/admin/members" className="inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-ink-700 hover:text-ink-950">
                {t("admin.activeMembers")} {d.active} <ChevronRight className="size-4" aria-hidden />
              </Link>
            </div>
            <MemberGrid
              members={rows.map((r) => {
                const state = monthState(r, today);
                return { id: r.id, name: r.name, state, stateLabel: t(`monthState.${state}`, { month: "" }).trim() };
              })}
              legend={{ overdue: t("monthState.overdue"), unpaid: t("monthState.unpaid"), part: t("monthState.part"), paid: t("monthState.paid"), none: t("monthState.none") }}
            />
            <p className="mt-2 text-[13px] text-ink-500">{t("admin.glanceHelp")}</p>
          </Card>

          <Card className="order-7 px-4 pb-1 pt-4 lg:order-none" aria-labelledby="act-h">
            <h2 id="act-h" className="font-display text-[22px] font-bold text-ink-950">
              {t("admin.recentActivity")}
            </h2>
            {feed.length ? <ActivityList rows={feed} t={t} lang={lang} /> : <p className="py-6 text-center text-ink-500">{t("admin.noActivity")}</p>}
          </Card>
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-6">
          <ButtonLink href="/admin/pay" variant="primary" size="lg" block className="order-2 min-h-16 text-[18px] lg:order-none">
            <HandCoins className="size-6" aria-hidden />
            {t("admin.recordPayment")}
          </ButtonLink>

          {/* What's waiting on Bharat — nothing is listed twice. */}
          <Card className="order-3 overflow-hidden lg:order-none" aria-labelledby="needs-h">
            <h2 id="needs-h" className="px-4 pt-4 font-display text-[22px] font-bold text-ink-950">
              {t("admin.needsYou")}
            </h2>
            {queue.length ? (
              <ul className="mt-1 divide-y divide-sand-200">
                {queue.map((q) => (
                  <li key={q.href}>
                    <Link href={q.href} className="flex min-h-16 items-center gap-3 px-4 py-2.5 transition hover:bg-sand-50 active:bg-sand-100">
                      <span className={cx("grid size-10 shrink-0 place-items-center rounded-[12px]", q.tone === "bad" ? "bg-bad-soft text-bad" : "bg-info-soft text-info")}>
                        <q.icon className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-ink-950">{q.title}</span>
                        {q.detail && <span className="block truncate text-[14px] text-ink-600">{q.detail}</span>}
                      </span>
                      <span className={cx("grid min-w-8 place-items-center rounded-full px-2 font-display text-[18px] font-bold leading-8", q.tone === "bad" ? "bg-bad text-white" : "bg-ink-950 text-volt")}>{q.n}</span>
                      <ChevronRight className="size-5 shrink-0 text-ink-400" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 px-4 pb-4 pt-2 font-semibold text-ok">
                <UserCheck className="size-5" aria-hidden />
                {t("admin.allCaughtUp")}
              </p>
            )}
          </Card>

          <Card className="order-5 p-4 lg:order-none" aria-labelledby="gym-h">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="gym-h" className="font-display text-[22px] font-bold text-ink-950">
                {t("admin.gymToday")}
              </h2>
              <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ink-700">
                <Footprints className="size-4 text-volt-ink" aria-hidden />
                {t("admin.gymTodayCount", { n: gym.length })}
              </span>
            </div>
            {gym.length ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {gym.map((g) => (
                  <li key={g.id}>
                    <Link href={`/admin/members/${g.id}?tab=visits`} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-volt-soft py-1 pl-1 pr-3 text-[14px] font-semibold text-ink-900 transition hover:bg-volt/50">
                      <Avatar name={g.name} size="sm" tone="volt" />
                      {g.name.split(" ")[0]}
                      <span className="font-normal text-ink-600">{fmtTime(g.recorded_at, lang)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[15px] text-ink-500">{t("admin.gymTodayNone")}</p>
            )}
          </Card>

          <Card className="order-6 overflow-hidden lg:order-none" aria-labelledby="fu-h">
            <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
              <h2 id="fu-h" className="font-display text-[22px] font-bold text-ink-950">
                {t("admin.needsFollowUp")}
              </h2>
              <Link href="/admin/followup" className="inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-ink-700 hover:text-ink-950">
                {t("common.seeAll")} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
            {follow.length ? (
              <ul className="divide-y divide-sand-200">
                {follow.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar name={f.name} size="sm" />
                    <Link href={`/admin/members/${f.id}?tab=visits`} className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink-950">{f.name}</span>
                      <span className="block text-[14px] text-ink-600">{f.last_visit ? t("admin.lastVisit", { when: rel(f.last_visit) }) : t("admin.noVisitYet", { when: rel(f.since) })}</span>
                    </Link>
                    <WhatsAppSheet
                      memberId={f.id}
                      name={f.name}
                      waNumber={isDemo() ? null : waNumber(f.phone)}
                      messages={attendanceMessages(f.name)}
                      defaultLang={f.language as "en"}
                      kind="attendance"
                      lastOpenedLabel={f.last_prompt ? t("whatsapp.lastOpened", { when: rel(f.last_prompt) }) : t("whatsapp.neverOpened")}
                      label={`${t("memberDetail.followUp")}: ${f.name}`}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 pb-4 pt-1 text-[15px] text-ink-500">{t("admin.noFollowUps")}</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
