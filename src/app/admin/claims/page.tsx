import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, ReceiptText } from "lucide-react";
import { ConfirmClaim, LinkClaim, RejectClaim } from "./actions-ui";
import { Avatar, Card, EmptyState, PageHeader, SectionTitle, StatusBadge } from "@/components/ui";
import { claimReason, fmtDate, fmtMonth, money, photoUrl, relDay } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { all } from "@/lib/db";
import { sum } from "@/lib/ledger";
import { planAllocation } from "@/lib/plan";
import { claims, linkablePaymentsOf, openChargesOf, unbilledMonthsOf } from "@/lib/queries";
import { requireAdmin } from "@/lib/session";
import { addDays, todayIST } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("claims.title") };
}

export default async function ClaimsPage() {
  await requireAdmin();
  const { t, lang } = await getT();
  const today = todayIST();
  const pending = await claims("pending");
  const reviewed = await claims("reviewed", 15);
  const label = (m: string | null, chargeId?: number) => {
    if (m) return fmtMonth(m, lang);
    const c = chargeId ? openById.get(chargeId) : undefined;
    return c?.kind === "manual" ? c.description || t("memberDetail.manual") : t("memberDetail.opening");
  };
  const openById = new Map<number, { kind?: string; description?: string | null }>();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("claims.title")} sub={t("claims.sub")} back={{ href: "/admin/inbox", label: t("nav.inbox") }} />
      {pending.length === 0 ? (
        <EmptyState icon={ReceiptText} title={t("claims.empty")} />
      ) : (
        <ul className="space-y-3">
          {await Promise.all(pending.map(async (c) => {
            const [open, future, linkable] = await all(() => openChargesOf(c.member_id, today), () => unbilledMonthsOf(c.member_id), () => linkablePaymentsOf(c.member_id));
            const outstanding = sum(open.map((o) => o.outstanding));
            for (const o of open) openById.set(o.id, o);
            const plan = planAllocation(c.amount_paise, open, future);
            // Possible duplicates: recorded payments not yet tied to a claim, within a week of the claimed date.
            const matches = linkable.filter((p) => p.amount_paise === c.amount_paise && p.paid_on >= addDays(c.paid_on, -7) && p.paid_on <= addDays(c.paid_on, 7));
            return (
              <Card as="li" key={c.id} className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={c.name} photo={c.photo} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link href={`/admin/members/${c.member_id}`} className="truncate font-semibold text-ink-950 underline-offset-2 hover:underline">
                        {c.name}
                      </Link>
                      <span className="font-display text-[26px] font-bold leading-none tabular text-ink-950">{money(c.amount_paise, lang)}</span>
                    </div>
                    <p className="mt-1 text-[14px] text-ink-700">
                      {t(`methods.${c.method}`)} · {fmtDate(c.paid_on, lang)}
                      {c.reference && <span className="font-semibold"> · {c.reference}</span>}
                    </p>
                    {c.note && <p className="mt-1 text-[14px] italic text-ink-600">“{c.note}”</p>}
                    {c.proof && (
                      <a href={c.proof} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block rounded-[12px] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-ink-900">
                        {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary already resizes and converts via the URL */}
                        <img src={photoUrl(c.proof, "wide")} alt={t("claims.proof")} loading="lazy" className="max-h-56 w-auto rounded-[12px] border border-sand-200 bg-sand-100 object-contain" />
                        <span className="mt-1 inline-flex min-h-8 items-center gap-1 text-[13px] font-semibold text-ink-700 underline underline-offset-2">
                          <ExternalLink className="size-3.5" aria-hidden />
                          {t("claims.viewProof")}
                        </span>
                      </a>
                    )}
                    <p className="mt-1 text-[13px] text-ink-500">
                      {t("claims.submitted", { when: relDay(c.created_at, today, t) })} · {outstanding ? t("pay.owes", { amount: money(outstanding, lang) }) : t("pay.nothingOwed")}
                    </p>
                  </div>
                </div>
                {matches.length > 0 && (
                  <div className="mt-3 rounded-[14px] border border-info/20 bg-info-soft p-3">
                    <p className="text-[14px] font-semibold text-info">{t("claims.possibleMatch")}</p>
                    <ul className="mt-1.5 space-y-1.5">
                      {matches.map((p) => {
                        const summary = `${money(p.amount_paise, lang)} · ${t(`methods.${p.method}`)} · ${fmtDate(p.paid_on, lang)}`;
                        return (
                          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-[14px] text-ink-900">
                            <span className="tabular">{summary}</span>
                            <LinkClaim claimId={c.id} paymentId={p.id} summary={summary} />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
                  <RejectClaim claimId={c.id} />
                  <ConfirmClaim
                    claimId={c.id}
                    title={t("claims.confirmTitle", { amount: money(c.amount_paise, lang), name: c.name.split(" ")[0] })}
                    lines={[
                      ...plan.lines.map((l) => [label(l.month, l.chargeId), money(l.amount, lang)] as [string, string]),
                      ...(plan.credit ? ([[t("pay.credit"), money(plan.credit, lang)]] as [string, string][]) : []),
                    ]}
                    balanceAfter={money(Math.max(outstanding - plan.lines.filter((l) => l.chargeId).reduce((s, l) => s + l.amount, 0), 0), lang)}
                  />
                </div>
              </Card>
            );
          }))}
        </ul>
      )}

      {reviewed.length > 0 && (
        <>
          <SectionTitle>{t("claims.reviewed")}</SectionTitle>
          <Card as="div" className="divide-y divide-sand-200">
            {reviewed.map((c) => (
              <Link key={c.id} href={`/admin/members/${c.member_id}?tab=payments`} className="flex items-start justify-between gap-3 px-4 py-3 transition hover:bg-sand-50">
                <span className="min-w-0">
                  <span className="block font-semibold text-ink-950">{c.name}</span>
                  <span className="block text-[14px] text-ink-600 tabular">
                    {money(c.amount_paise, lang)} · {t(`methods.${c.method}`)} · {fmtDate(c.paid_on, lang)}
                  </span>
                  {c.reject_reason && <span className="mt-0.5 block text-[14px] text-bad">“{claimReason(c.reject_reason, t)}”</span>}
                </span>
                <StatusBadge status={c.status} label={t(`claimStatus.${c.status}`)} />
              </Link>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
