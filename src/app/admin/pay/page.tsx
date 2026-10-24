import type { Metadata } from "next";
import { PaymentForm } from "./form";
import { MemberPicker } from "./picker";
import { PageHeader } from "@/components/ui";
import { isDemo } from "@/lib/db";
import { fmtMonth, money } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { balanceOf, feeFor, openCharges, unbilledMonths } from "@/lib/ledger";
import { waNumber } from "@/lib/phone";
import { claimsFor, directory, profile } from "@/lib/queries";
import { requireAdmin } from "@/lib/session";
import { currentMonth, todayIST } from "@/lib/time";

export const metadata: Metadata = { title: "Record payment" };

export default async function PayPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireAdmin();
  const { t, lang } = await getT();
  const id = Number((await searchParams).m);
  const p = Number.isInteger(id) && id > 0 ? profile(id) : undefined;

  if (!p) {
    const rows = directory()
      .filter((r) => r.status !== "left" || r.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name))
      .map((r) => ({ id: r.id, name: r.name, digits: r.phone.slice(3), owes: r.outstanding, overdue: r.overdue > 0, claims: r.pending_claims }));
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={t("pay.title")} sub={t("pay.pickHint")} back={{ href: "/admin", label: t("nav.today") }} />
        <MemberPicker rows={rows} />
      </div>
    );
  }

  const today = todayIST();
  const open = openCharges(id, today);
  const future = unbilledMonths(id, 6);
  const bal = balanceOf(id, today);
  const claims = claimsFor(id).filter((c) => c.status === "pending");
  const label = (m: string | null, kind: "open" | "future") => (m ? fmtMonth(m, lang, "long") : t("memberDetail.opening")) + (kind === "future" ? ` · ${t("whatsapp.advance")}` : "");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("pay.title")} back={{ href: `/admin/members/${id}`, label: p.name }} />
      <PaymentForm
        key={id}
        member={{ id, name: p.name, wa: isDemo() ? null : waNumber(p.phone), language: p.language }}
        today={today}
        open={open.map((c) => ({ ...c, label: label(c.month, "open") }))}
        future={future.map((f) => ({ ...f, label: label(f.month, "future") }))}
        outstanding={bal.outstanding}
        credit={bal.credit}
        monthFee={feeFor(currentMonth()) ?? 0}
        claimNotice={claims.length ? t("pay.claimNotice", { name: p.name.split(" ")[0], amount: money(claims.reduce((s, c) => s + c.amount_paise, 0), lang) }) : null}
      />
    </div>
  );
}
