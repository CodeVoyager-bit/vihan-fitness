import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, UserPlus } from "lucide-react";
import { Approve, RejectRegistration } from "./actions-ui";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { setting } from "@/lib/db";
import { money, relDay } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { feeFor } from "@/lib/ledger";
import { formatPhone } from "@/lib/phone";
import { pendingRegistrations, startMonthOptions } from "@/lib/queries";
import { requireAdmin } from "@/lib/session";
import { currentMonth, todayIST } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("approvals.title") };
}

export default async function ApprovalsPage() {
  await requireAdmin();
  const { t, lang } = await getT();
  const rows = await pendingRegistrations();
  const months = startMonthOptions(await setting("launch_month"));
  const now = currentMonth();
  const fee = (await feeFor(now)) ?? 0;
  const today = todayIST();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("approvals.title")} sub={t("approvals.sub")} back={{ href: "/admin/inbox", label: t("nav.inbox") }} />
      {rows.length === 0 ? (
        <EmptyState icon={UserPlus} title={t("approvals.empty")} />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <Card as="li" key={r.id} className="p-4">
              <div className="flex items-start gap-3">
                <Avatar name={r.name} />
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] font-semibold text-ink-950">{r.name}</p>
                  <p className="text-[14px] text-ink-600 tabular">
                    {formatPhone(r.phone)} · <span lang={r.language}>{t(`langs.${r.language}`)}</span>
                  </p>
                  <p className="text-[13px] text-ink-500">{t("approvals.registered", { when: relDay(r.created_at, today, t) })}</p>
                  {r.duplicateOf && (
                    <Badge tone="warn" icon={AlertTriangle} wrap className="mt-2">
                      <Link href={`/admin/members/${r.duplicateOf.id}`} className="underline underline-offset-2">
                        {t("approvals.duplicateFlag", { name: `${r.duplicateOf.name} (${formatPhone(r.duplicateOf.phone)})` })}
                      </Link>
                    </Badge>
                  )}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
                <RejectRegistration userId={r.id} name={r.name} />
                <Approve userId={r.id} name={r.name} months={months} defaultMonth={now} fee={money(fee, lang)} />
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
