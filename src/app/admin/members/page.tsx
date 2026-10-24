import type { Metadata } from "next";
import { Directory, type DirItem } from "./directory";
import { PageHeader } from "@/components/ui";
import { isDemo } from "@/lib/db";
import { fmtMonth } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { formatPhone, waNumber } from "@/lib/phone";
import { directory, monthState } from "@/lib/queries";
import { requireAdmin } from "@/lib/session";
import { todayIST } from "@/lib/time";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  await requireAdmin();
  const { t, lang } = await getT();
  const { f, q } = await searchParams;
  const today = todayIST();
  const demo = isDemo();
  const rows: DirItem[] = directory(today).map((r) => {
    const state = monthState(r, today);
    return {
      id: r.id,
      name: r.name,
      phone: formatPhone(r.phone),
      digits: r.phone.slice(3),
      tel: demo ? null : r.phone,
      wa: demo ? null : waNumber(r.phone),
      status: r.status,
      outstanding: r.outstanding,
      overdue: r.overdue,
      credit: r.credit,
      claims: r.pending_claims,
      state,
      stateLabel: t(`monthState.${state}`, { month: fmtMonth(r.billing_start_month, lang) }),
    };
  });
  return (
    <>
      <PageHeader title={t("directory.title")} sub={t("admin.membersCount", { n: rows.length })} />
      <Directory rows={rows} initialFilter={f ?? "all"} initialQuery={q ?? ""} />
    </>
  );
}
