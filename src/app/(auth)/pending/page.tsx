import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Hourglass, Info, XCircle } from "lucide-react";
import { logoutAction } from "@/app/actions/common";
import { getT } from "@/lib/i18n/server";
import { requireUser, homeFor } from "@/lib/session";
import { ButtonLink, btn } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("auth.pendingTab") };
}

export default async function PendingPage() {
  const u = await requireUser();
  if (u.status === "approved" || u.role === "admin") redirect(homeFor(u));
  const { t } = await getT();
  const rejected = u.status === "rejected";
  const first = u.name.split(" ")[0];
  return (
    <div className="text-center">
      <span className={`mx-auto grid size-20 place-items-center rounded-full ${rejected ? "bg-bad-soft text-bad" : "bg-volt text-ink-950"}`}>
        {rejected ? <XCircle className="size-10" aria-hidden /> : <Hourglass className="size-10 motion-safe:animate-[spin_6s_linear_infinite]" aria-hidden />}
      </span>
      <h1 className="mt-5 font-display text-[38px] font-extrabold leading-[1.05] text-ink-950">
        {rejected ? t("auth.rejectedTitle") : t("auth.pendingTitle", { name: first })}
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-[17px] text-ink-700">{rejected ? t("auth.rejectedBody") : t("auth.pendingBody")}</p>
      {!rejected && (
        <>
          <p className="mx-auto mt-4 max-w-sm text-[15px] text-ink-600">{t("auth.pendingHint")}</p>
          <p className="mx-auto mt-5 flex max-w-sm items-start gap-2 rounded-[14px] bg-sand-100 px-3.5 py-3 text-left text-[14px] text-ink-700">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("auth.pendingFee")}
          </p>
          <ButtonLink href="/pending" variant="dark" block className="mt-6">
            {t("auth.checkAgain")}
          </ButtonLink>
        </>
      )}
      <form action={logoutAction} className="mt-3">
        <button className={btn({ variant: "ghost", block: true })}>{t("common.signOut")}</button>
      </form>
    </div>
  );
}
