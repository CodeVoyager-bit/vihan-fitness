import type { Metadata } from "next";
import { Mark } from "@/components/brand";
import { allT, getT } from "@/lib/i18n/server";
import { checkinUrl, qrSvg, registerUrl } from "@/lib/qr";
import { requireAdmin } from "@/lib/session";
import { PrintButton } from "./print";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("settings.qr") };
}

/** A4 poster. The check-in code is convenience, not proof of presence — it is never tied to rewards. */
export default async function QrPoster({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireAdmin();
  const { t } = await getT();
  const ts = await allT(); // the poster speaks all three languages, whoever prints it
  const register = (await searchParams).kind === "register";
  const url = register ? await registerUrl() : await checkinUrl();
  const svg = await qrSvg(url);
  return (
    <div className="mx-auto flex min-h-dvh max-w-[720px] flex-col items-center justify-center bg-white p-10 text-center text-ink-950">
      <Mark className="size-16" />
      <p className="mt-4 font-display text-[28px] font-extrabold uppercase">{ts.en("common.appName")}</p>
      <h1 className="mt-2 font-display text-[64px] font-black uppercase leading-[0.9]">{ts.en(register ? "qr.registerTitle" : "qr.checkinTitle")}</h1>
      <p className="mt-2 text-[22px]">
        <span lang="mr">{ts.mr(register ? "qr.registerTitle" : "qr.checkinTitle")}</span> · <span lang="hi">{ts.hi(register ? "qr.registerTitle" : "qr.checkinTitle")}</span>
      </p>
      <div className="mt-8 w-[420px] max-w-full rounded-[28px] border-[6px] border-ink-950 p-5 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="mt-6 max-w-md text-[17px] text-ink-700">{t(register ? "qr.registerHelp" : "qr.checkinHelp")}</p>
      <p className="mt-3 break-all font-mono text-[13px] text-ink-500">{url}</p>
      <PrintButton label={t("settings.qrPrint")} />
    </div>
  );
}
