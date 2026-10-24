"use client";

import { Copy, Smartphone } from "lucide-react";
import { toast } from "@/components/client";
import { useI18n } from "@/components/i18n-provider";
import { btn } from "@/components/ui";
import { upiLink } from "@/lib/site-config";

/**
 * Opens GPay / PhonePe / Paytm with the owner's UPI ID and the amount filled in (Admin → More → Rules).
 * Paying here doesn't change the balance: the member still says "I have paid" and the owner confirms.
 */
export function UpiPay({ id, name, rupees, note }: { id: string; name: string; rupees: number; note: string }) {
  const { t, lang } = useI18n();
  const amount = new Intl.NumberFormat(`${lang}-IN-u-nu-latn`, { maximumFractionDigits: 2 }).format(rupees);
  return (
    <div className="mt-4 rounded-[16px] border border-sand-200 bg-sand-50 p-3">
      <a href={upiLink({ id, name, rupees, note })} className={btn({ variant: "dark", size: "md", block: true })}>
        <Smartphone className="size-5" aria-hidden />
        {t("fees.upiPay", { amount })}
      </a>
      <div className="mt-2 flex items-center justify-between gap-2 text-[14px] text-ink-700">
        <span className="min-w-0 truncate font-mono">{t("fees.upiTo", { id })}</span>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(id).then(() => toast(t("fees.upiCopied")))}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 font-semibold text-ink-800 hover:bg-sand-200"
        >
          <Copy className="size-4" aria-hidden />
          {t("fees.upiCopy")}
        </button>
      </div>
      <p className="text-[13px] text-ink-500">{t("fees.upiAfter")}</p>
    </div>
  );
}
