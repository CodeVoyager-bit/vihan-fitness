import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LifeBuoy, ReceiptText, UserPlus, Inbox } from "lucide-react";
import { Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { money } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { claims, helpRequests, inboxCounts, pendingRegistrations } from "@/lib/queries";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage() {
  await requireAdmin();
  const { t, lang } = await getT();
  const c = inboxCounts();
  const cl = claims("pending", 3);
  const regs = pendingRegistrations().slice(0, 3);
  const help = helpRequests(true).filter((h) => h.status === "open").slice(0, 3);
  const groups = [
    { href: "/admin/claims", icon: ReceiptText, title: t("inbox.claims"), n: c.claims, preview: cl.map((x) => `${x.name} · ${money(x.amount_paise, lang)}`) },
    { href: "/admin/approvals", icon: UserPlus, title: t("inbox.approvals"), n: c.approvals, preview: regs.map((r) => r.name) },
    { href: "/admin/help", icon: LifeBuoy, title: t("inbox.help"), n: c.help, preview: help.map((h) => `${h.name} · ${t(`helpTopic.${h.topic}`)}`) },
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("inbox.title")} sub={t("inbox.sub")} />
      {c.claims + c.approvals + c.help === 0 && (
        <div className="mb-4">
          <EmptyState icon={Inbox} title={t("inbox.nothing")} />
        </div>
      )}
      <ul className="space-y-3">
        {groups.map((g) => (
          <li key={g.href}>
            <Card as="div" className="transition hover:border-ink-300">
              <Link href={g.href} className="flex items-center gap-4 p-4">
                <span className={cx("grid size-12 shrink-0 place-items-center rounded-[14px]", g.n ? "bg-ink-950 text-volt" : "bg-sand-200 text-ink-500")}>
                  <g.icon className="size-6" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[17px] font-semibold text-ink-950">
                    {g.title}
                    {g.n > 0 && <span className="grid min-w-6 place-items-center rounded-full bg-bad px-1.5 text-[13px] font-bold leading-6 text-white">{g.n}</span>}
                  </span>
                  {g.preview.length > 0 && <span className="mt-0.5 block truncate text-[14px] text-ink-600">{g.preview.join(" · ")}</span>}
                </span>
                <ChevronRight className="size-5 text-ink-400" aria-hidden />
              </Link>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
