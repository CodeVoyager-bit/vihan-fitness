import type { Metadata } from "next";
import { HelpForm } from "./form";
import { Card, PageHeader, SectionTitle, StatusBadge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { helpFor } from "@/lib/queries";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Ask Bharat sir" };

export default async function HelpPage() {
  const me = await requireMember();
  const { t, lang } = await getT();
  const mine = helpFor(me.id);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("help.memberTitle")} sub={t("help.memberSub")} back={{ href: "/app", label: t("nav.home") }} />
      <Card className="p-4">
        <HelpForm />
      </Card>
      <SectionTitle>{t("help.yours")}</SectionTitle>
      {mine.length === 0 ? (
        <p className="px-1 text-ink-500">{t("help.none")}</p>
      ) : (
        <Card as="ul" className="divide-y divide-sand-200">
          {mine.map((h) => (
            <li key={h.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink-950">{t(`helpTopic.${h.topic}`)}</p>
                  <p className="text-[13px] text-ink-500">{fmtDate(h.created_at.slice(0, 10), lang)}</p>
                </div>
                <StatusBadge status={h.status} label={t(`helpStatus.${h.status}`)} />
              </div>
              {h.message && <p className="mt-1 text-[15px] text-ink-700">“{h.message}”</p>}
              {h.admin_note && <p className="mt-2 rounded-[12px] bg-volt-soft px-3 py-2 text-[14px] text-volt-ink">{t("help.reply", { note: h.admin_note })}</p>}
            </li>
          ))}
        </Card>
      )}
    </div>
  );
}
