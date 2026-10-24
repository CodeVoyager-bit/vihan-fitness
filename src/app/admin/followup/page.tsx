import type { Metadata } from "next";
import Link from "next/link";
import { Hourglass, UserCheck, Wallet } from "lucide-react";
import { WhatsAppSheet } from "@/components/client";
import { Avatar, Badge, Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { isDemo, settingInt } from "@/lib/db";
import { followUpCandidates } from "@/lib/engage";
import { fmtMonths, money, relDay } from "@/lib/format";
import { allT, getT } from "@/lib/i18n/server";
import { attendanceMessages, feeMessages } from "@/lib/messages";
import { waNumber } from "@/lib/phone";
import { directory, lastReminders, openChargesOf } from "@/lib/queries";
import { requireAdmin } from "@/lib/session";
import { todayIST } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("followup.title") };
}

export default async function FollowupPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireAdmin();
  const { t, lang } = await getT();
  const ts = await allT();
  const tab = (await searchParams).tab === "fees" ? "fees" : "attendance";
  const today = todayIST();
  const demo = isDemo();
  const rel = (s: string) => relDay(s, today, t);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("followup.title")} back={{ href: "/admin/more", label: t("nav.more") }} />
      <nav aria-label={t("followup.title")} className="mb-4 grid grid-cols-2 gap-1 rounded-[16px] bg-sand-200/80 p-1">
        {(["attendance", "fees"] as const).map((k) => (
          <Link
            key={k}
            aria-current={tab === k ? "page" : undefined}
            href={`?tab=${k}`}
            replace
            className={cx("flex min-h-11 items-center justify-center rounded-[12px] font-semibold transition", tab === k ? "bg-white text-ink-950 shadow-[var(--shadow-card)]" : "text-ink-600")}
          >
            {t(`followup.tabs.${k}`)}
          </Link>
        ))}
      </nav>

      {tab === "attendance" ? <Attendance /> : <Fees />}
    </div>
  );

  async function Attendance() {
    const rows = await followUpCandidates(today);
    return (
      <>
        <p className="mb-3 text-[15px] text-ink-600">{t("followup.attendanceSub", { days: await settingInt("inactivity_days", 8) })}</p>
        {rows.length === 0 ? (
          <EmptyState icon={UserCheck} title={t("followup.emptyAttendance")} />
        ) : (
          <Card as="ul" className="divide-y divide-sand-200">
            {rows.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={f.name} photo={f.photo} size="sm" />
                <Link href={`/admin/members/${f.id}?tab=visits`} className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink-950">{f.name}</span>
                  <span className="block text-[14px] text-ink-600">{f.last_visit ? t("admin.lastVisit", { when: rel(f.last_visit) }) : t("admin.noVisitYet", { when: rel(f.since) })}</span>
                  <span className="block text-[13px] text-ink-500">{f.last_prompt ? t("followup.lastReminder", { when: rel(f.last_prompt) }) : t("followup.noReminder")}</span>
                </Link>
                <WhatsAppSheet
                  memberId={f.id}
                  name={f.name}
                  waNumber={demo ? null : waNumber(f.phone)}
                  messages={attendanceMessages(ts, f.name)}
                  defaultLang={f.language as "en"}
                  kind="attendance"
                  label={`${t("memberDetail.followUp")}: ${f.name}`}
                />
              </li>
            ))}
          </Card>
        )}
        <p className="mt-3 text-[13px] text-ink-500">{t("followup.excluded", { days: await settingInt("followup_cooldown_days", 7) })}</p>
      </>
    );
  }

  async function Fees() {
    const last = await lastReminders("fee");
    const rows = (await directory(today))
      .filter((r) => r.overdue > 0)
      .sort((a, b) => b.overdue - a.overdue);
    return (
      <>
        <p className="mb-3 text-[15px] text-ink-600">{t("followup.feesSub")}</p>
        {rows.length === 0 ? (
          <EmptyState icon={Wallet} title={t("followup.emptyFees")} />
        ) : (
          <Card as="ul" className="divide-y divide-sand-200">
            {await Promise.all(rows.map(async (r) => {
              const open = await openChargesOf(r.id, today);
              const lastAt = last.get(r.id);
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={r.name} photo={r.photo} size="sm" tone="ink" />
                  <Link href={`/admin/members/${r.id}`} className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold text-ink-950">{r.name}</span>
                      <span className="font-display text-[18px] font-bold tabular text-bad">{money(r.outstanding, lang)}</span>
                    </span>
                    <span className="block text-[14px] text-ink-600">{fmtMonths(open.filter((c) => c.month).map((c) => c.month!), lang)}</span>
                    <span className="block text-[13px] text-ink-500">{lastAt ? t("followup.lastReminder", { when: rel(lastAt) }) : t("followup.noReminder")}</span>
                    {r.pending_claims > 0 && (
                      <Badge tone="info" icon={Hourglass} className="mt-1">
                        {t("directory.claimFlag")}
                      </Badge>
                    )}
                  </Link>
                  <WhatsAppSheet
                    memberId={r.id}
                    name={r.name}
                    waNumber={demo ? null : waNumber(r.phone)}
                    messages={feeMessages(ts, r.name, r.outstanding, open.filter((c) => c.month).map((c) => c.month!), open.some((c) => !c.month))}
                    defaultLang={r.language}
                    kind="fee"
                    claimWarning={r.pending_claims ? t("whatsapp.claimWarning", { name: r.name.split(" ")[0], amount: money(r.pending_claim_amount, lang) }) : null}
                    claimHref="/admin/claims"
                    lastOpenedLabel={lastAt ? t("whatsapp.lastOpened", { when: rel(lastAt) }) : t("whatsapp.neverOpened")}
                    label={`${t("memberDetail.feeReminder")}: ${r.name}`}
                  />
                </li>
              );
            }))}
          </Card>
        )}
      </>
    );
  }
}
