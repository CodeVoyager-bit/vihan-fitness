import type { Metadata } from "next";
import { ClaimForm } from "./form";
import { PageHeader } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { balanceOf, feeFor } from "@/lib/ledger";
import { requireMember } from "@/lib/session";
import { getRules, getSite } from "@/lib/site";
import { UpiPay } from "@/components/member/upi-pay";
import { currentMonth, todayIST } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("claimForm.title") };
}

export default async function ClaimPage() {
  const me = await requireMember();
  const { t, lang } = await getT();
  const bal = await balanceOf(me.id);
  // Money already claimed (waiting for confirmation) isn't suggested twice.
  const suggested = Math.max(bal.outstanding - bal.pendingClaimAmount, 0) || await feeFor(currentMonth()) || 0;
  const rules = await getRules();
  const gym = (await getSite(lang)).vars.gym;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("claimForm.title")} sub={t("claimForm.sub")} back={{ href: "/app/fees", label: t("nav.fees") }} />
      {rules.upiId && suggested > 0 && <UpiPay id={rules.upiId} name={rules.upiName || gym} rupees={suggested / 100} note={`${gym} · ${me.name}`} />}
      <ClaimForm today={todayIST()} suggested={suggested / 100} methods={rules.methods} />
    </div>
  );
}
