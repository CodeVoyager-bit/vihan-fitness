import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterForm } from "./form";
import { getT } from "@/lib/i18n/server";
import { getUser, homeFor } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("auth.registerTitle") };
}

export default async function RegisterPage() {
  const u = await getUser();
  if (u) redirect(homeFor(u));
  const { t, lang } = await getT();
  return (
    <>
      <h1 className="font-display text-[40px] font-extrabold leading-[1.05] text-ink-950">{t("auth.registerTitle")}</h1>
      <p className="mb-6 mt-2 text-ink-600">{t("auth.registerSub")}</p>
      <RegisterForm lang={lang} />
      <p className="mt-6 text-[15px] text-ink-600">
        {t("auth.haveAccount")}{" "}
        <Link href="/login" className="inline-flex min-h-11 items-center font-semibold text-ink-950 underline decoration-volt decoration-[3px] underline-offset-4">
          {t("auth.login")}
        </Link>
      </p>
    </>
  );
}
