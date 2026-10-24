import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Hourglass, Trophy, Wallet } from "lucide-react";
import { ChallengeJoin, CheckInButton, HelpQuick, MyChecklist } from "@/components/member/widgets";
import { LangSwitcher } from "@/components/client";
import { Bar, ButtonLink, Card, Notice, ProgressRing, SectionTitle, StatusBadge, cx } from "@/components/ui";
import { activeChallenge, canCheckIn, challengeEntry, challengeProgress, goalFor, onboardingDone, recognitionWall, visitDates } from "@/lib/engage";
import { fmtDate, fmtMonths, fmtWeekday, money } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { getRules } from "@/lib/site";
import { checklistLabel } from "@/lib/site-config";
import { balanceOf, openCharges, statusAt } from "@/lib/ledger";
import { requireMember } from "@/lib/session";
import { todayIST } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("nav.home") };
}

export default async function MemberHome() {
  const me = await requireMember();
  const { t, lang } = await getT();
  const { checklist } = await getRules();
  const today = todayIST();
  const month = today.slice(0, 7);
  const [visits, goal, st, bal, open, challenge, done] = await Promise.all([
    visitDates(me.id, month),
    goalFor(me.id, month),
    statusAt(me.id, month),
    balanceOf(me.id, today),
    openCharges(me.id, today),
    activeChallenge(month),
    onboardingDone(me.id),
  ]);
  const status = st ?? "active";
  const entry = challenge ? await challengeEntry(challenge.id, me.id) : null;
  const checkedIn = visits.includes(today);
  const left = Math.max(goal.target - visits.length, 0);
  const encourage = left === 0 ? t("member.goalReached") : visits.length === 0 ? t("member.goalEncourage.start") : left <= 3 ? t("member.goalEncourage.near", { n: left }) : t("member.goalEncourage.mid");
  const first = me.name.split(" ")[0];

  return (
    <>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-medium text-ink-500">{fmtDate(today, lang, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-0.5 font-display text-[36px] font-extrabold leading-[1.05] text-ink-950">{t("member.welcome", { name: first })}</h1>
        </div>
        <LangSwitcher className="lg:hidden" />
      </header>

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
      <div>
      {/* Personal progress leads; fees come second. */}
      <section aria-labelledby="goal-h" className="dark-surface relative overflow-hidden rounded-[var(--radius-2xl)] bg-ink-950 p-5 text-sand-0 shadow-[var(--shadow-lift)]">
        <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-10 size-72 rounded-full bg-volt/20 blur-3xl" />
        <div className="relative flex items-center gap-5">
          <ProgressRing value={visits.length} max={goal.target} dark size={128} stroke={12} label={t("member.progress", { done: visits.length, target: goal.target })}>
            <span>
              <span className="block font-display text-[44px] font-extrabold leading-none tabular text-volt">{visits.length}</span>
              <span className="block text-[13px] font-semibold text-sand-0/70">/ {goal.target}</span>
            </span>
          </ProgressRing>
          <div className="min-w-0">
            <h2 id="goal-h" className="text-[15px] font-semibold text-sand-0/75">
              {t("member.monthlyGoal", { n: goal.target })}
            </h2>
            <p className="mt-1 font-display text-[26px] font-bold leading-tight">{t("member.progress", { done: visits.length, target: goal.target })}</p>
            <p className="mt-1 text-[14px] text-sand-0/75">{encourage}</p>
          </div>
        </div>
        <div className="relative mt-5 flex flex-wrap items-center gap-3">
          {await canCheckIn(me.id, month) ? (
            <CheckInButton dateLabel={fmtWeekday(today, lang)} done={checkedIn} target={goal.target} />
          ) : (
            <p className="text-[15px] text-sand-0/80">{status === "paused" ? t("member.pausedNote") : t("member.leftNote")}</p>
          )}
          <Link href="/app/attendance" className="inline-flex min-h-12 items-center gap-1.5 rounded-[14px] px-3 font-semibold text-sand-0/85 hover:text-white">
            {t("nav.visits")} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>

      <SectionTitle
        action={
          <Link href="/app/fees" className="inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-ink-700 hover:text-ink-950">
            {t("nav.fees")} <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      >
        {t("member.membership")}
      </SectionTitle>
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {bal.outstanding > 0 ? (
              <>
                <p className={cx("font-display text-[30px] font-extrabold leading-none tabular", bal.overdue ? "text-bad" : "text-ink-950")}>{t("member.feesDue", { amount: money(bal.outstanding, lang) })}</p>
                <p className="mt-1 text-[14px] text-ink-600">
                  {open.some((c) => c.month) && t("member.feesDueFor", { months: fmtMonths(open.filter((c) => c.month).map((c) => c.month!), lang) })}
                  {bal.overdue > 0 && ` · ${t("member.feesOverdue")}`}
                </p>
              </>
            ) : (
              <p className="flex items-center gap-2 text-[17px] font-semibold text-ok">
                <CheckCircle2 className="size-5" aria-hidden />
                {t("member.feesClear")}
              </p>
            )}
            {bal.credit > 0 && <p className="mt-1 text-[14px] font-medium text-volt-ink">{t("member.feesCredit", { amount: money(bal.credit, lang) })}</p>}
          </div>
          <StatusBadge status={status} label={t(`memberStatus.${status}`)} />
        </div>
        {bal.pendingClaims > 0 && (
          <div className="mt-3">
            <Notice tone="info" icon={Hourglass}>
              {t("member.claimPending", { amount: money(bal.pendingClaimAmount, lang) })}
            </Notice>
          </div>
        )}
        {bal.outstanding > 0 && bal.pendingClaims === 0 && (
          <ButtonLink href="/app/fees/claim" variant="secondary" block className="mt-3">
            <Wallet className="size-5" aria-hidden />
            {t("member.iHavePaid")}
          </ButtonLink>
        )}
      </Card>

      <div className="mt-3">
        <HelpQuick />
      </div>

      </div>
      <div className="lg:[&>*:first-child]:mt-0">
      {challenge && (
        <>
          <SectionTitle>{t("member.challenge")}</SectionTitle>
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-volt text-ink-950">
                <Trophy className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-[22px] font-bold leading-tight text-ink-950">{t(`challenge.templates.${challenge.template}.title`)}</h3>
                <p className="text-[14px] text-ink-600">{t(`challenge.templates.${challenge.template}.body`, { n: challenge.target_visits ?? 0, offer: challenge.offer_text ?? "" })}</p>
              </div>
            </div>
            {entry &&
              ((p) => {
                return p.target ? (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[13px] font-semibold text-ink-600">
                      <span>{t("challenge.progress", { done: Math.min(p.done, p.target), target: p.target })}</span>
                      {p.complete && <span className="text-ok">✓ {t("challenge.completed")}</span>}
                    </div>
                    <Bar value={p.done} max={p.target} label={t("challenge.progress", { done: p.done, target: p.target })} />
                  </div>
                ) : (
                  <p className="mt-3 text-[14px] text-ink-600">{p.complete ? `✓ ${t("challenge.completed")}` : t("challenge.buddyPending")}</p>
                );
              })(await challengeProgress(challenge, me.id))}
            <div className="mt-3">
              <ChallengeJoin challengeId={challenge.id} joined={!!entry} showName={!!entry?.show_name} />
            </div>
            {((wall) => {
              return wall.length ? (
                <div className="mt-4 border-t border-sand-200 pt-3">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-500">{t("challenge.recognition")}</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {wall.map((n, i) => (
                      <li key={i} className="rounded-full bg-volt-soft px-3 py-1 text-[14px] font-semibold text-volt-ink">
                        {n}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null;
            })(await recognitionWall(challenge))}
          </Card>
        </>
      )}

      {checklist.some((i) => !done.has(i.key)) && (
        <>
          <SectionTitle>
            {t("member.onboarding")} · {checklist.filter((i) => done.has(i.key)).length}/{checklist.length}
          </SectionTitle>
          <Card className="p-2">
            <MyChecklist items={checklist.map((i) => ({ key: i.key, label: checklistLabel(i, lang, t), done: done.has(i.key) }))} />
          </Card>
        </>
      )}
      </div>
      </div>
    </>
  );
}
