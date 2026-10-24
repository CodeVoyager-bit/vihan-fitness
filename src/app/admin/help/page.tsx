import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { HelpActions } from "./actions-ui";
import { Avatar, Card, EmptyState, PageHeader, SectionTitle, StatusBadge } from "@/components/ui";
import { relDay } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { helpRequests } from "@/lib/queries";
import { requireAdmin } from "@/lib/session";
import { todayIST } from "@/lib/time";

export const metadata: Metadata = { title: "Help requests" };

export default async function HelpPage() {
  await requireAdmin();
  const { t } = await getT();
  const today = todayIST();
  const open = helpRequests(true);
  const done = helpRequests(false);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("help.adminTitle")} sub={t("help.adminSub")} back={{ href: "/admin/inbox", label: t("nav.inbox") }} />
      {open.length === 0 ? (
        <EmptyState icon={LifeBuoy} title={t("help.empty")} />
      ) : (
        <ul className="space-y-3">
          {open.map((h) => (
            <Card as="li" key={h.id} className="p-4">
              <div className="flex items-start gap-3">
                <Avatar name={h.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/admin/members/${h.member_id}`} className="font-semibold text-ink-950 hover:underline">
                      {h.name}
                    </Link>
                    <StatusBadge status={h.status} label={t(`helpStatus.${h.status}`)} />
                  </div>
                  <p className="text-[14px] font-semibold text-ink-700">{t(`helpTopic.${h.topic}`)}</p>
                  {h.message && (
                    <p lang={h.language} className="mt-1 text-[15px] text-ink-800">
                      “{h.message}”
                    </p>
                  )}
                  <p className="mt-1 text-[13px] text-ink-500">{relDay(h.created_at, today, t)}</p>
                </div>
              </div>
              <div className="mt-3">
                <HelpActions id={h.id} status={h.status as "open"} />
              </div>
            </Card>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <>
          <SectionTitle>{t("help.resolvedList")}</SectionTitle>
          <Card as="ul" className="divide-y divide-sand-200">
            {done.map((h) => (
              <li key={h.id} className="px-4 py-3">
                <p className="font-semibold text-ink-950">
                  {h.name} · <span className="font-normal text-ink-600">{t(`helpTopic.${h.topic}`)}</span>
                </p>
                {h.admin_note && <p className="text-[14px] text-ink-600">→ {h.admin_note}</p>}
              </li>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
