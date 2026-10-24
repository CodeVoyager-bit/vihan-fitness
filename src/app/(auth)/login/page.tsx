import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, User, UserCog, Hourglass } from "lucide-react";
import { LoginForm } from "./form";
import { demoLoginAction } from "@/app/actions/auth";
import { isDemo } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { getUser, homeFor } from "@/lib/session";
import { btn } from "@/components/ui";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const u = await getUser();
  if (u) redirect(homeFor(u));
  const { next, reset } = await searchParams;
  const { t } = await getT();
  return (
    <>
      <h1 className="font-display text-[40px] font-extrabold leading-[1.05] text-ink-950">{t("auth.loginTitle")}</h1>
      <p className="mb-6 mt-2 text-ink-600">{t("auth.loginSub")}</p>
      {reset && <p role="status" className="mb-4 rounded-[14px] bg-ok-soft px-4 py-3 text-[15px] font-semibold text-ok">{t("auth.resetDone")}</p>}
      <LoginForm next={next ?? ""} />
      <div className="mt-6 flex flex-col gap-2 text-[15px] sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ink-600">
          {t("auth.noAccount")}{" "}
          <Link href="/register" className="inline-flex min-h-11 items-center font-semibold text-ink-950 underline decoration-volt decoration-[3px] underline-offset-4">
            {t("auth.register")}
          </Link>
        </p>
        <Link href="/reset" className="inline-flex min-h-11 items-center font-medium text-ink-600 hover:text-ink-950">
          {t("auth.forgot")}
        </Link>
      </div>
      {isDemo() && (
        <section aria-labelledby="demo-h" className="mt-6 rounded-[18px] border border-dashed border-ink-300 bg-sand-50 p-4">
          <h2 id="demo-h" className="flex items-center gap-2 text-[15px] font-bold text-ink-900">
            <ShieldCheck className="size-4 text-volt-ink" aria-hidden />
            {t("auth.demoTitle")}
          </h2>
          <p className="mb-3 text-[13px] text-ink-500">{t("auth.demoSub")}</p>
          <form action={demoLoginAction} className="grid gap-2 sm:grid-cols-3">
            <button name="as" value="admin" className={btn({ variant: "dark", size: "sm" })}>
              <UserCog className="size-4" aria-hidden />
              {t("auth.demoAdmin")}
            </button>
            <button name="as" value="member" className={btn({ variant: "primary", size: "sm" })}>
              <User className="size-4" aria-hidden />
              {t("auth.demoMember")}
            </button>
            <button name="as" value="pending" className={btn({ variant: "secondary", size: "sm" })}>
              <Hourglass className="size-4" aria-hidden />
              {t("auth.demoPending")}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
