import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck2, HandCoins, Hourglass, Phone, ReceiptText } from "lucide-react";
import { AddChargeSheet, Checklist, FollowupToggle, ResetCodeSheet, ReversePaymentSheet, StatusSheet, UndoWaiverSheet, VisitSheet, WaiveSheet } from "./sheets";
import { memberPhotoAction } from "@/app/actions/admin";
import { ActivityList } from "@/components/admin/activity";
import { VisitCalendar } from "@/components/calendar";
import { PhotoButtons, WhatsAppSheet } from "@/components/client";
import { Avatar, Badge, Bar, ButtonLink, Card, EmptyState, KeyValue, Notice, SectionTitle, StatusBadge, cx } from "@/components/ui";
import { isDemo } from "@/lib/db";
import { goalFor, lastVisit, onboardingDone, visitDates } from "@/lib/engage";
import { claimReason, fmtDate, fmtDateTime, fmtMonth, fmtMonths, money, relDay } from "@/lib/format";
import type { T } from "@/lib/i18n";
import { allT, getT } from "@/lib/i18n/server";
import { getRules } from "@/lib/site";
import { checklistLabel } from "@/lib/site-config";
import { balanceOf, chargesFor, statusAt } from "@/lib/ledger";
import { attendanceMessages, feeMessages } from "@/lib/messages";
import { photosEnabled } from "@/lib/photos";
import { formatPhone, waNumber } from "@/lib/phone";
import { activity, claimsFor, lastReminder, paymentsFor, profile, remindersFor, statusHistory, waiversFor } from "@/lib/queries";
import { requireAdmin } from "@/lib/session";
import { addMonths, currentMonth, istDate, monthsBetween, todayIST } from "@/lib/time";

type Tab = "fees" | "payments" | "visits" | "profile";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await requireAdmin();
  const p = await profile(Number((await params).id));
  return { title: p?.name ?? (await getT()).t("common.member") };
}

export default async function MemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; wa?: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? await profile(id) : undefined;
  if (!p) notFound();
  const sp = await searchParams;
  const tab: Tab = (["fees", "payments", "visits", "profile"] as const).find((x) => x === sp.tab) ?? "fees";
  const { t, lang } = await getT();
  const ts = await allT();
  const today = todayIST();
  const month = currentMonth();
  const status = await statusAt(id, month) ?? "active";
  const bal = await balanceOf(id, today);
  const charges = await chargesFor(id);
  const open = charges.filter((c) => c.outstanding > 0);
  const demo = isDemo();
  const rel = (s: string) => relDay(s, today, t);
  const lastFee = await lastReminder(id, "fee");
  const lastAtt = await lastReminder(id, "attendance");
  const pendingClaims = (await claimsFor(id)).filter((c) => c.status === "pending");
  const waKind = sp.wa === "attendance" || (!sp.wa && bal.outstanding === 0) ? "attendance" : "fee";

  const tabs: { key: Tab; label: string }[] = [
    { key: "fees", label: t("memberDetail.tabs.fees") },
    { key: "payments", label: t("memberDetail.tabs.payments") },
    { key: "visits", label: t("memberDetail.tabs.visits") },
    { key: "profile", label: t("memberDetail.tabs.profile") },
  ];

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-8">
      <div className="lg:sticky lg:top-6">
      <Link href="/admin/members" className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[15px] font-medium text-ink-600 hover:text-ink-900">
        ‹ {t("common.members")}
      </Link>

      <header className="flex items-center gap-4">
        <Avatar name={p.name} photo={p.photo} size="lg" tone={bal.overdue ? "ink" : "volt"} />
        <div className="min-w-0">
          <h1 className="font-display text-[32px] font-extrabold leading-[1.05] text-ink-950 sm:text-[38px]">{p.name}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-ink-600">
            <StatusBadge status={status} label={t(`memberStatus.${status}`)} />
            <span className="tabular">{formatPhone(p.phone)}</span>
            <span aria-hidden>·</span>
            <span lang={p.language}>{t(`langs.${p.language}`)}</span>
          </p>
        </div>
      </header>

      {/* Balance + the three things Bharat does most. */}
      <Card className="mt-5 p-4 sm:p-5">
        {bal.outstanding > 0 ? (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-500">{t("memberDetail.outstanding")}</p>
              <p className={cx("font-display text-[44px] font-extrabold leading-none tabular", bal.overdue ? "text-bad" : "text-ink-950")}>{money(bal.outstanding, lang)}</p>
              <p className="mt-1 text-[14px] text-ink-600">{fmtMonths(open.filter((c) => c.period_month).map((c) => c.period_month!), lang)}</p>
            </div>
            {bal.overdue > 0 && <Badge tone="bad">{t("memberDetail.overdue")} {money(bal.overdue, lang)}</Badge>}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-[30px] font-extrabold leading-[1.05] text-ok">{t("memberDetail.allClear")}</p>
            {bal.credit > 0 && <Badge tone="volt">{t("memberDetail.credit")} {money(bal.credit, lang)}</Badge>}
          </div>
        )}
        <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2">
          <ButtonLink href={`/admin/pay?m=${id}`} variant="primary" block>
            <HandCoins className="size-5" aria-hidden />
            {t("admin.recordPayment")}
          </ButtonLink>
          <WhatsAppSheet
            key={waKind}
            memberId={id}
            name={p.name}
            waNumber={demo ? null : waNumber(p.phone)}
            defaultLang={p.language}
            kind={waKind}
            messages={
              waKind === "fee"
                ? feeMessages(ts, p.name, bal.outstanding, open.filter((c) => c.kind === "monthly").map((c) => c.period_month!), open.some((c) => c.kind !== "monthly"))
                : attendanceMessages(ts, p.name)
            }
            lastOpenedLabel={(waKind === "fee" ? lastFee : lastAtt) ? t("whatsapp.lastOpened", { when: rel((waKind === "fee" ? lastFee : lastAtt)!) }) : t("whatsapp.neverOpened")}
            claimWarning={waKind === "fee" && pendingClaims.length ? t("whatsapp.claimWarning", { name: p.name.split(" ")[0], amount: money(pendingClaims[0].amount_paise, lang) }) : null}
            claimHref="/admin/claims"
            label={waKind === "fee" ? t("memberDetail.feeReminder") : t("memberDetail.followUp")}
            variant="icon"
            autoOpen={!!sp.wa}
          />
          <a
            href={demo ? undefined : `tel:${p.phone}`}
            aria-disabled={demo}
            aria-label={`${t("common.call")} ${formatPhone(p.phone)}`}
            className="grid size-12 place-items-center rounded-[14px] border border-sand-300 bg-sand-0 text-ink-800 transition hover:bg-white aria-disabled:opacity-40"
          >
            <Phone className="size-5" aria-hidden />
          </a>
        </div>
      </Card>

      {pendingClaims.length > 0 && (
        <div className="mt-3">
          <Notice
            tone="info"
            icon={Hourglass}
            action={
              <ButtonLink href="/admin/claims" variant="dark" size="sm">
                {t("memberDetail.review")}
              </ButtonLink>
            }
          >
            {t("memberDetail.pendingClaimBanner", { amount: money(pendingClaims.reduce((s, c) => s + c.amount_paise, 0), lang) })}
          </Notice>
        </div>
      )}

      </div>
      <div>
      <nav aria-label={p.name} className="sticky top-0 z-20 -mx-4 mt-5 lg:mt-0 bg-sand-100/95 px-4 py-2 backdrop-blur-md sm:mx-0 sm:px-0">
        <ul className="grid grid-cols-4 gap-1 rounded-[16px] bg-sand-200/80 p-1">
          {tabs.map((x) => (
            <li key={x.key}>
              <Link
                href={`?tab=${x.key}`}
                replace
                scroll={false}
                aria-current={tab === x.key ? "page" : undefined}
                className={cx("flex min-h-11 items-center justify-center rounded-[12px] text-[14px] font-semibold transition", tab === x.key ? "bg-white text-ink-950 shadow-[var(--shadow-card)]" : "text-ink-600 hover:text-ink-900")}
              >
                {x.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-3 [&>*:first-child]:mt-0">
        {tab === "fees" && <FeesTab id={id} t={t} lang={lang} charges={charges} />}
        {tab === "payments" && <PaymentsTab id={id} t={t} lang={lang} />}
        {tab === "visits" && <VisitsTab id={id} t={t} lang={lang} today={today} />}
        {tab === "profile" && <ProfileTab id={id} t={t} lang={lang} p={p} status={status} charges={charges} />}
      </div>
      </div>
    </div>
  );
}

type Lang = "en" | "mr" | "hi";

async function FeesTab({ id, t, lang, charges }: { id: number; t: T; lang: Lang; charges: Awaited<ReturnType<typeof chargesFor>> }) {
  const waivers = await waiversFor(id);
  const today = todayIST();
  return (
    <>
      <SectionTitle action={<AddChargeSheet memberId={id} />}>{t("memberDetail.ledger")}</SectionTitle>
      {charges.length === 0 ? (
        <EmptyState icon={ReceiptText} title={t("memberDetail.noCharges")} />
      ) : (
        <Card as="div" className="divide-y divide-sand-200">
          {charges.map((c) => {
            const state = c.outstanding <= 0 ? (c.paid_paise > 0 ? "paid" : "waived") : c.paid_paise > 0 ? "part" : c.due_date < today ? "overdue" : "unpaid";
            const label = c.kind === "monthly" ? fmtMonth(c.period_month!, lang, "long") : c.kind === "opening" ? t("memberDetail.opening") : t("memberDetail.manual");
            const ws = waivers.filter((w) => w.charge_id === c.id);
            return (
              <div key={c.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-950">{label}</p>
                    {c.description && <p className="text-[14px] text-ink-600">{c.description}</p>}
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-500">
                      <StatusBadge status={state} label={t(`monthState.${state}`, { month: "" })} />
                      <span>{t("memberDetail.due", { date: fmtDate(c.due_date, lang, { day: "numeric", month: "short" }) })}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <p className="font-display text-[20px] font-bold tabular text-ink-950">{money(c.amount_paise, lang)}</p>
                    {c.outstanding > 0 && c.outstanding < c.amount_paise && <p className="text-[13px] font-semibold text-warn">{t("memberDetail.left", { amount: money(c.outstanding, lang) })}</p>}
                    {c.outstanding > 0 && (
                      <div className="-mr-3">
                        <WaiveSheet chargeId={c.id} outstanding={c.outstanding} label={label} />
                      </div>
                    )}
                  </div>
                </div>
                {((c.paid_paise > 0 && c.outstanding > 0) || ws.length > 0) && (
                  <div className="mt-1 space-y-0.5 text-[13px] text-ink-600">
                    {c.paid_paise > 0 && c.outstanding > 0 && <p>{t("memberDetail.paidOf", { paid: money(c.paid_paise, lang), amount: money(c.amount_paise, lang) })}</p>}
                    {ws.map((w) => (
                      <div key={w.id} className={cx("flex flex-wrap items-center gap-x-1", w.reversed_at && "line-through opacity-60")}>
                        {t("memberDetail.waivedAmount", { amount: money(w.amount_paise, lang) })} —{" "}
                        {w.source === "status" ? waiverReason(w.reason, t, lang) : `“${w.reason}”`}
                        {!w.reversed_at && <UndoWaiverSheet waiverId={w.id} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
}

function waiverReason(code: string, t: T, lang: Lang) {
  const [, status, month] = code.split(":");
  return t("memberDetail.statusWaiver", { status: t(`memberStatus.${status as "paused"}`).toLowerCase(), month: fmtMonth(month, lang) });
}

async function PaymentsTab({ id, t, lang }: { id: number; t: T; lang: Lang }) {
  const payments = await paymentsFor(id);
  const claims = await claimsFor(id);
  return (
    <>
      <SectionTitle>{t("memberDetail.payments")}</SectionTitle>
      {payments.length === 0 ? (
        <EmptyState icon={HandCoins} title={t("memberDetail.noPayments")} />
      ) : (
        <Card as="div" className="divide-y divide-sand-200">
          {payments.map((p) => {
            const months = p.months ? p.months.split(",") : [];
            return (
              <div key={p.id} className={cx("px-4 py-3", p.reversed_at && "bg-sand-50")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={cx("font-display text-[22px] font-bold leading-tight tabular", p.reversed_at ? "text-ink-400 line-through" : "text-ink-950")}>{money(p.amount_paise, lang)}</p>
                    <p className="text-[14px] text-ink-600">
                      {t(`methods.${p.method}`)} · {fmtDate(p.paid_on, lang)}
                      {p.reference && ` · ${p.reference}`}
                    </p>
                    {!p.reversed_at && (
                      <p className="mt-0.5 text-[14px] text-ink-700">
                        {[months.length ? t("memberDetail.covers", { months: fmtMonths(months, lang) }) : "", p.other_allocated ? t("memberDetail.otherCharges") : "", p.unallocated_paise > 0 ? t("memberDetail.toCredit", { amount: money(p.unallocated_paise, lang) }) : ""]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    {p.note && <p className="mt-0.5 text-[14px] italic text-ink-600">“{p.note}”</p>}
                    {p.claim_id && (
                      <Badge tone="info" className="mt-1.5">
                        {t("claimStatus.confirmed")} · #{p.claim_id}
                      </Badge>
                    )}
                    {p.reversed_at && (
                      <Badge tone="bad" wrap className="mt-1.5">
                        {t("memberDetail.reversedReason", { reason: p.reversal_reason ?? "" })}
                      </Badge>
                    )}
                  </div>
                  {!p.reversed_at && <ReversePaymentSheet paymentId={p.id} summary={`${money(p.amount_paise, lang)} · ${t(`methods.${p.method}`)} · ${fmtDate(p.paid_on, lang)}`} />}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <SectionTitle>{t("memberDetail.claims")}</SectionTitle>
      {claims.length === 0 ? (
        <p className="px-1 text-[15px] text-ink-500">{t("memberDetail.noClaims")}</p>
      ) : (
        <Card as="div" className="divide-y divide-sand-200">
          {claims.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-semibold text-ink-950 tabular">
                  {money(c.amount_paise, lang)} · {t(`methods.${c.method}`)}
                </p>
                <p className="text-[14px] text-ink-600">
                  {fmtDate(c.paid_on, lang)}
                  {c.reference && ` · ${c.reference}`}
                </p>
                {c.reject_reason && <p className="mt-0.5 text-[14px] text-bad">“{claimReason(c.reject_reason, t)}”</p>}
              </div>
              <StatusBadge status={c.status} label={t(`claimStatus.${c.status}`)} />
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

async function VisitsTab({ id, t, lang, today }: { id: number; t: T; lang: Lang; today: string }) {
  const month = today.slice(0, 7);
  const visits = await visitDates(id, month);
  const goal = await goalFor(id, month);
  const last = await lastVisit(id);
  const reminders = await remindersFor(id);
  return (
    <>
      <Card className="p-4 sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-500">{t("memberDetail.visitsThisMonth")}</p>
            <p className="font-display text-[44px] font-extrabold leading-none tabular text-ink-950">
              {visits.length}
              <span className="text-[24px] text-ink-400"> / {goal.target}</span>
            </p>
          </div>
          <p className="text-right text-[14px] text-ink-600">
            {t("memberDetail.lastVisit")}
            <br />
            <span className="font-semibold text-ink-900">{last ? `${fmtDate(last, lang, { day: "numeric", month: "short" })} · ${relDay(last, today, t)}` : t("common.never")}</span>
          </p>
        </div>
        <div className="mt-3">
          <Bar value={visits.length} max={goal.target} label={t("member.progress", { done: visits.length, target: goal.target })} />
        </div>
        <div className="mt-5">
          <VisitCalendar month={month} visits={visits} today={today} lang={lang} label={t("attendance.calendarLabel", { month: fmtMonth(month, lang, "long") })} visitedLabel={t("attendance.visited")} todayLabel={t("attendance.todayLabel")} compact />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <VisitSheet memberId={id} mode="add" today={today} />
          <VisitSheet memberId={id} mode="remove" today={today} />
        </div>
      </Card>

      <SectionTitle>{t("memberDetail.reminders")}</SectionTitle>
      {reminders.length === 0 ? (
        <p className="px-1 text-[15px] text-ink-500">{t("memberDetail.noReminders")}</p>
      ) : (
        <Card as="div" className="divide-y divide-sand-200">
          {reminders.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]">
              <span className="flex items-center gap-2 font-medium text-ink-900">
                <CalendarCheck2 className="size-4 text-ink-500" aria-hidden />
                {t(`memberDetail.reminderKind.${r.kind}`)} · {t(`langs.${r.language as Lang}`)}
              </span>
              <span className="text-[14px] text-ink-600 tabular">{fmtDateTime(r.opened_at, lang)}</span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

async function ProfileTab({ id, t, lang, p, status, charges }: { id: number; t: T; lang: Lang; p: NonNullable<Awaited<ReturnType<typeof profile>>>; status: string; charges: Awaited<ReturnType<typeof chargesFor>> }) {
  const auditRows = await activity(40, id);
  const history = await statusHistory(id);
  const done = await onboardingDone(id);
  const now = currentMonth();
  const months = monthsBetween(p.billing_start_month, addMonths(now, 3)).reverse();
  const upcoming = history.find((h) => h.effective_month > now);
  return (
    <>
      {photosEnabled() && (
        <>
          <SectionTitle>{t("common.photo")}</SectionTitle>
          <Card className="flex items-center gap-4 p-4">
            <Avatar name={p.name} photo={p.photo} size="lg" />
            <PhotoButtons action={memberPhotoAction.bind(null, id)} has={!!p.photo} />
          </Card>
        </>
      )}
      <SectionTitle action={<StatusSheet memberId={id} current={status as "active"} months={months} thisMonth={now} billingStart={p.billing_start_month} charges={charges.filter((c) => c.kind === "monthly").map((c) => ({ month: c.period_month!, outstanding: c.outstanding, paid: c.paid_paise }))} />}>
        {t("memberDetail.membership")}
      </SectionTitle>
      <Card className="px-4 py-1">
        <KeyValue
          items={[
            [t("common.status"), <StatusBadge key="s" status={status} label={t(`memberStatus.${status as "active"}`)} />],
            ...(upcoming ? ([[t("memberDetail.effectiveMonth"), t("memberDetail.scheduled", { status: t(`memberStatus.${upcoming.status}`), month: fmtMonth(upcoming.effective_month, lang) })]] as [string, string][]) : []),
            [t("memberDetail.sinceLabel"), fmtDate(istDate(p.reviewed_at), lang)],
            [t("memberDetail.billingFromLabel"), fmtMonth(p.billing_start_month, lang, "long")],
            [t("auth.phone"), formatPhone(p.phone)],
          ]}
        />
      </Card>

      <SectionTitle>{t("memberDetail.statusHistory")}</SectionTitle>
      <Card as="div" className="divide-y divide-sand-200">
        {history.map((h) => (
          <div key={h.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div>
              <StatusBadge status={h.status} label={t(`memberStatus.${h.status}`)} />
              {h.reason && h.reason !== "approved" && <p className="mt-1 text-[14px] text-ink-600">“{h.reason}”</p>}
            </div>
            <p className="text-right text-[14px] text-ink-600">
              {fmtMonth(h.effective_month, lang, "long")}
              <br />
              <span className="text-[13px] text-ink-500">{fmtDate(istDate(h.created_at), lang)}</span>
            </p>
          </div>
        ))}
      </Card>

      <SectionTitle>{t("memberDetail.onboarding")}</SectionTitle>
      <Card className="p-2">
        <Checklist memberId={id} items={(await getRules()).checklist.map((i) => ({ key: i.key, label: checklistLabel(i, lang, t), done: done.has(i.key) }))} />
      </Card>

      <SectionTitle>{t("memberDetail.account")}</SectionTitle>
      <Card className="space-y-3 p-4">
        <FollowupToggle memberId={id} on={!!p.followup_opt_in} />
        <ResetCodeSheet memberId={id} name={p.name} />
      </Card>

      <SectionTitle>{t("memberDetail.audit")}</SectionTitle>
      <Card as="div" className="px-4 py-1">
        {auditRows.length ? <ActivityList rows={auditRows} t={t} lang={lang} linkMembers={false} /> : <p className="py-6 text-center text-ink-500">{t("memberDetail.noAudit")}</p>}
      </Card>
    </>
  );
}
