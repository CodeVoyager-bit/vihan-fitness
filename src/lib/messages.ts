// WhatsApp message texts in all three languages, so Bharat can pick per member.
import { fmtDate, fmtMonths, rupees } from "./format";
import { type Lang, LANGS, makeT } from "./i18n";
import type { Method } from "./ledger";

const firstName = (name: string) => name.split(" ")[0];
const all = (fn: (lang: Lang) => string) => Object.fromEntries(LANGS.map((l) => [l, fn(l)])) as Record<Lang, string>;

/** `months` are YYYY-MM for monthly charges; `earlier` is true when an opening/manual balance is included. */
export function feeMessages(name: string, amount: number, months: string[], earlier: boolean) {
  return all((lang) => {
    const t = makeT(lang);
    const parts = [months.length ? fmtMonths(months, lang) : "", earlier ? t("whatsapp.earlier") : ""].filter(Boolean);
    return t("whatsapp.templates.fee", { name: firstName(name), amount: rupees(amount, lang), months: parts.join(" + ") });
  });
}

export const attendanceMessages = (name: string) => all((lang) => makeT(lang)("whatsapp.templates.attendance", { name: firstName(name) }));

export function receiptMessages(o: { name: string; amount: number; date: string; method: Method; months: string[]; credit: number; balance: number }) {
  return all((lang) => {
    const t = makeT(lang);
    const covered = [o.months.length ? fmtMonths(o.months, lang) : "", o.credit ? `₹${rupees(o.credit, lang)} ${t("whatsapp.advance")}` : ""].filter(Boolean).join(" + ");
    return t("whatsapp.templates.receipt", {
      name: firstName(o.name),
      amount: rupees(o.amount, lang),
      date: fmtDate(o.date, lang),
      method: t(`methods.${o.method}`),
      months: covered || "—",
      balance: rupees(o.balance, lang),
    });
  });
}
