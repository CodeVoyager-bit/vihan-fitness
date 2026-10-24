import type { Metadata } from "next";
import { Mark } from "@/components/brand";
import { getT } from "@/lib/i18n/server";
import { checkinUrl, qrSvg, registerUrl } from "@/lib/qr";
import { requireAdmin } from "@/lib/session";
import { PrintButton } from "./print";

export const metadata: Metadata = { title: "QR poster" };

/** A4 poster. The check-in code is convenience, not proof of presence — it is never tied to rewards. */
export default async function QrPoster({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireAdmin();
  const { t } = await getT();
  const register = (await searchParams).kind === "register";
  const url = register ? await registerUrl() : await checkinUrl();
  const svg = await qrSvg(url);
  return (
    <div className="mx-auto flex min-h-dvh max-w-[720px] flex-col items-center justify-center bg-white p-10 text-center text-ink-950">
      <Mark className="size-16" />
      <p className="mt-4 font-display text-[28px] font-extrabold uppercase">Vihan Fitness</p>
      <h1 className="mt-2 font-display text-[64px] font-black uppercase leading-[0.9]">{register ? "Join us" : "Check in"}</h1>
      <p className="mt-2 text-[22px]">{register ? "नोंदणी करा · रजिस्टर करें" : "चेक-इन करा · चेक-इन करें"}</p>
      <div className="mt-8 w-[420px] max-w-full rounded-[28px] border-[6px] border-ink-950 p-5 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="mt-6 max-w-md text-[17px] text-ink-700">{register ? t("auth.registerSub") : t("member.checkInHelp")}</p>
      <p className="mt-3 break-all font-mono text-[13px] text-ink-500">{url}</p>
      <PrintButton label={t("settings.qrPrint")} />
    </div>
  );
}
