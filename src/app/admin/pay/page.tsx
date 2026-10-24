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

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("pay.title") };
}

export default async function PayPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireAdmin();
  const { t, lang } = await getT();
  const id = Number((await searchParams).m);
  const p = Number.isInteger(id) && id > 0 ? await profile(id) : undefined;

  if (!p) {
    const rows = (await directory())
      .filter((r) => r.status !== "left" || r.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name))
      .map((r) => ({ id: r.id, name: r.name, photo: r.photo, digits: r.phone.slice(3), owes: r.outstanding, overdue: r.overdue > 0, claims: r.pending_claims }));
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={t("pay.title")} sub={t("pay.pickHint")} back={{ href: "/admin", label: t("nav.today") }} />
        <MemberPicker rows={rows} />
      </div>
    );
  }

  const today = todayIST();
  const open = await openCharges(id, today);
  const future = await unbilledMonths(id); // same horizon the server plans with
  const bal = await balanceOf(id, today);
  const claims = (await claimsFor(id)).filter((c) => c.status === "pending");
  const label = (m: string | null, kind: "open" | "future", c?: { kind?: string; description?: string | null }) =>
    (m ? fmtMonth(m, lang, "long") : c?.kind === "manual" ? c.description || t("memberDetail.manual") : t("memberDetail.opening")) + (kind === "future" ? ` · ${t("whatsapp.advance")}` : "");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("pay.title")} back={{ href: `/admin/members/${id}`, label: p.name }} />
      <PaymentForm
        key={id}
        member={{ id, name: p.name, photo: p.photo, wa: isDemo() ? null : waNumber(p.phone), language: p.language }}
        today={today}
        open={open.map((c) => ({ ...c, label: label(c.month, "open", c) }))}
        future={future.map((f) => ({ ...f, label: label(f.month, "future") }))}
        outstanding={bal.outstanding}
        credit={bal.credit}
        monthFee={await feeFor(currentMonth()) ?? 0}
        claimNotice={claims.length ? t("pay.claimNotice", { name: p.name.split(" ")[0], amount: money(claims.reduce((s, c) => s + c.amount_paise, 0), lang) }) : null}
      />
    </div>
  );
}
