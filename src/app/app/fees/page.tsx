import type { Metadata } from "next";
import { CheckCircle2, Info, Wallet } from "lucide-react";
import { ButtonLink, Card, EmptyState, PageHeader, SectionTitle, StatusBadge, cx } from "@/components/ui";
import { claimReason, fmtDate, fmtMonth, fmtMonths, money } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { balanceOf, chargesFor } from "@/lib/ledger";
import { claimsFor, paymentsFor } from "@/lib/queries";
import { requireMember } from "@/lib/session";
import { todayIST } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("fees.title") };
}

export default async function FeesPage() {
  const me = await requireMember();
  const { t, lang } = await getT();
  const today = todayIST();
  const bal = await balanceOf(me.id, today);
  const charges = await chargesFor(me.id);
  const payments = (await paymentsFor(me.id)).filter((p) => !p.reversed_at);
  const claims = await claimsFor(me.id);

  return (
    <>
      <PageHeader title={t("fees.title")} />
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
      <div>
      <Card className="p-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-500">{t("fees.outstanding")}</p>
            <p className={cx("font-display text-[40px] font-extrabold leading-none tabular", bal.overdue ? "text-bad" : bal.outstanding ? "text-ink-950" : "text-ok")}>{money(bal.outstanding, lang)}</p>
          </div>
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-500">{t("fees.credit")}</p>
            <p className="font-display text-[40px] font-extrabold leading-none tabular text-ink-950">{money(bal.credit, lang)}</p>
          </div>
        </div>
        {bal.overdue > 0 && <p className="mt-2 text-[14px] font-medium text-bad">{t("fees.overdueNote", { amount: money(bal.overdue, lang) })}</p>}
        <ButtonLink href="/app/fees/claim" variant={bal.outstanding ? "primary" : "secondary"} block className="mt-4">
          <Wallet className="size-5" aria-hidden />
          {t("member.iHavePaid")}
        </ButtonLink>
        <p className="mt-3 flex items-start gap-2 text-[13px] text-ink-500">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("fees.offlineNote")}
        </p>
      </Card>

      {claims.length > 0 && (
        <>
          <SectionTitle>{t("fees.claims")}</SectionTitle>
          <Card as="ul" className="divide-y divide-sand-200">
            {claims.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-ink-950 tabular">
                    {money(c.amount_paise, lang)} · {t(`methods.${c.method}`)}
                    <span className="block text-[14px] font-normal text-ink-600">{fmtDate(c.paid_on, lang)}</span>
                  </p>
                  <StatusBadge status={c.status} label={t(`claimStatus.${c.status}`)} />
                </div>
                {c.reject_reason && <p className="mt-1 text-[14px] text-bad">{t("fees.rejectedReason", { reason: claimReason(c.reject_reason, t) })}</p>}
              </li>
            ))}
          </Card>
        </>
      )}

      </div>
      <div className="lg:[&>*:first-child]:mt-0">
      <SectionTitle>{t("fees.byMonth")}</SectionTitle>
      {charges.length === 0 ? (
        <EmptyState icon={CheckCircle2} title={t("fees.noCharges")} />
      ) : (
        <Card as="ul" className="divide-y divide-sand-200">
          {charges.map((c) => {
            const state = c.outstanding <= 0 ? (c.paid_paise > 0 ? "paid" : "waived") : c.paid_paise > 0 ? "part" : c.due_date < today ? "overdue" : "unpaid";
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-semibold text-ink-950">{c.kind === "monthly" ? fmtMonth(c.period_month!, lang, "long") : c.kind === "opening" ? t("memberDetail.opening") : c.description || t("memberDetail.manual")}</p>
                  <StatusBadge status={state} label={t(`monthState.${state}`, { month: "" })} className="mt-1" />
                </div>
                <div className="text-right">
                  <p className="font-display text-[20px] font-bold tabular text-ink-950">{money(c.amount_paise, lang)}</p>
                  {c.outstanding > 0 && c.outstanding < c.amount_paise && <p className="text-[13px] font-semibold text-warn">{t("memberDetail.left", { amount: money(c.outstanding, lang) })}</p>}
                </div>
              </li>
            );
          })}
        </Card>
      )}

      <SectionTitle>{t("fees.payments")}</SectionTitle>
      {payments.length === 0 ? (
        <p className="px-1 text-ink-500">{t("fees.noPayments")}</p>
      ) : (
        <Card as="ul" className="divide-y divide-sand-200">
          {payments.map((p) => (
            <li key={p.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-display text-[20px] font-bold tabular text-ink-950">{money(p.amount_paise, lang)}</p>
                <p className="text-[14px] text-ink-600">
                  {t(`methods.${p.method}`)} · {fmtDate(p.paid_on, lang)}
                </p>
              </div>
              {p.months && <p className="text-[14px] text-ink-700">{t("memberDetail.covers", { months: fmtMonths(p.months.split(","), lang) })}</p>}
            </li>
          ))}
        </Card>
      )}
      </div>
      </div>
    </>
  );
}
