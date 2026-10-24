import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, ChevronRight, Download, Globe, HardDriveDownload, LifeBuoy, LogOut, MapPin, MessageSquareText, Printer, QrCode, ReceiptText, Scale, Trophy, Type, UserPlus, UserRoundSearch } from "lucide-react";
import { BillingForm, FeeForm, FollowupForm, PasswordForm, RunBilling } from "./forms";
import { logoutAction } from "@/app/actions/common";
import { rotateCheckinAction } from "@/app/actions/admin";
import { ConfirmAction, LangSwitcher } from "@/components/client";
import { ButtonLink, Card, KeyValue, PageHeader, SectionTitle, btn } from "@/components/ui";
import { setting, settingInt } from "@/lib/db";
import { fmtMonth, money } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { checkinUrl, qrSvg, registerUrl } from "@/lib/qr";
import { feeSchedule, inboxCounts } from "@/lib/queries";
import { requireAdmin } from "@/lib/session";
import { addMonths, currentMonth } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("settings.title") };
}

export default async function MorePage() {
  await requireAdmin();
  const { t, lang } = await getT();
  const c = await inboxCounts();
  const [checkin, register] = await Promise.all([checkinUrl(), registerUrl()]);
  const [checkinQr, registerQr] = await Promise.all([qrSvg(checkin), qrSvg(register)]);
  const links = [
    { href: "/admin/followup", icon: UserRoundSearch, label: t("followup.title") },
    { href: "/admin/claims", icon: ReceiptText, label: t("claims.title"), n: c.claims },
    { href: "/admin/approvals", icon: UserPlus, label: t("approvals.title"), n: c.approvals },
    { href: "/admin/help", icon: LifeBuoy, label: t("help.adminTitle"), n: c.help },
    { href: "/admin/challenge", icon: Trophy, label: t("challenge.title") },
  ];
  // Everything shown on the site and in messages: no developer needed to change it.
  const site = [
    { href: "/admin/more/brand", icon: BadgeCheck, page: "brand" },
    { href: "/admin/more/website", icon: Globe, page: "website" },
    { href: "/admin/more/contact", icon: MapPin, page: "contact" },
    { href: "/admin/more/messages", icon: MessageSquareText, page: "messages" },
    { href: "/admin/more/rules", icon: Scale, page: "rules" },
    { href: "/admin/more/text", icon: Type, page: "text" },
  ] as const;
  const exports = [
    ["members", t("settings.exportMembers")],
    ["charges", t("settings.exportCharges")],
    ["payments", t("settings.exportPayments")],
    ["claims", t("settings.exportClaims")],
    ["attendance", t("settings.exportAttendance")],
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("settings.title")} action={<LangSwitcher className="lg:hidden" />} />

      <SectionTitle>{t("settings.links")}</SectionTitle>
      <Card as="ul" className="divide-y divide-sand-200">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex min-h-14 items-center gap-3 px-4 transition hover:bg-sand-50">
              <l.icon className="size-5 text-ink-600" aria-hidden />
              <span className="flex-1 font-semibold text-ink-950">{l.label}</span>
              {!!l.n && <span className="grid min-w-6 place-items-center rounded-full bg-bad px-1.5 text-[13px] font-bold leading-6 text-white">{l.n}</span>}
              <ChevronRight className="size-5 text-ink-400" aria-hidden />
            </Link>
          </li>
        ))}
      </Card>

      <SectionTitle>{t("site.sectionTitle")}</SectionTitle>
      <Card as="ul" className="divide-y divide-sand-200">
        {site.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex min-h-16 items-center gap-3 px-4 py-2 transition hover:bg-sand-50">
              <l.icon className="size-5 shrink-0 text-ink-600" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink-950">{t(`site.pages.${l.page}.title`)}</span>
                <span className="block text-[14px] text-ink-600">{t(`site.pages.${l.page}.sub`)}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-ink-400" aria-hidden />
            </Link>
          </li>
        ))}
      </Card>

      <SectionTitle>{t("settings.qr")}</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { label: t("settings.qrCheckin"), svg: checkinQr, kind: "checkin" },
          { label: t("settings.qrRegister"), svg: registerQr, kind: "register" },
        ].map((q) => (
          <Card key={q.kind} className="flex items-center gap-4 p-4">
            <div className="size-28 shrink-0 overflow-hidden rounded-[12px] border border-sand-200 bg-white p-1 [&_svg]:size-full" role="img" aria-label={q.label} dangerouslySetInnerHTML={{ __html: q.svg }} />
            <div className="min-w-0 space-y-2">
              <p className="flex items-start gap-2 text-[15px] font-semibold text-ink-900">
                <QrCode className="mt-0.5 size-4 shrink-0" aria-hidden />
                {q.label}
              </p>
              <ButtonLink href={`/admin/qr?kind=${q.kind}`} variant="secondary" size="sm" target="_blank">
                <Printer className="size-4" aria-hidden />
                {t("settings.qrPrint")}
              </ButtonLink>
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 px-1">
        <ConfirmAction action={rotateCheckinAction} label={t("settings.qrRotate")} title={t("settings.qrRotate")} body={t("settings.qrRotateHelp")} confirmLabel={t("settings.qrRotate")} />
        <span className="text-[13px] text-ink-500">{t("settings.qrRotateHelp")}</span>
      </div>

      <SectionTitle>{t("settings.exports")}</SectionTitle>
      <Card className="p-4">
        <p className="mb-3 text-[14px] text-ink-600">{t("settings.exportsHelp")}</p>
        <div className="flex flex-wrap gap-2">
          {exports.map(([k, label]) => (
            <a key={k} href={`/admin/export/${k}`} download className={btn({ variant: "secondary", size: "sm" })}>
              <Download className="size-4" aria-hidden />
              {label}
            </a>
          ))}
          <a href="/admin/export/backup" download className={btn({ variant: "dark", size: "sm" })}>
            <HardDriveDownload className="size-4" aria-hidden />
            {t("settings.exportBackup")}
          </a>
        </div>
      </Card>

      <SectionTitle>{t("settings.billing")}</SectionTitle>
      <Card className="space-y-6 p-4">
        <BillingForm launch={await setting("launch_month") ?? currentMonth()} dueDay={await settingInt("due_day", 10)} />
        <div className="border-t border-sand-200 pt-5">
          <p className="mb-1 text-[15px] font-semibold text-ink-900">{t("settings.feeSchedule")}</p>
          <KeyValue items={(await feeSchedule()).map((f) => [fmtMonth(f.effective_month, lang, "long"), money(f.amount_paise, lang)] as [string, string])} />
          <div className="mt-4">
            <FeeForm nextMonth={addMonths(currentMonth(), 1)} />
          </div>
        </div>
        <div className="border-t border-sand-200 pt-5">
          <RunBilling />
        </div>
      </Card>

      <SectionTitle>{t("settings.followups")}</SectionTitle>
      <Card className="p-4">
        <FollowupForm days={await settingInt("inactivity_days", 8)} cooldown={await settingInt("followup_cooldown_days", 7)} />
      </Card>

      <SectionTitle>{t("settings.account")}</SectionTitle>
      <Card className="space-y-5 p-4">
        <PasswordForm />
        <form action={logoutAction} className="border-t border-sand-200 pt-4">
          <button className={btn({ variant: "danger", size: "md" })}>
            <LogOut className="size-5" aria-hidden />
            {t("common.signOut")}
          </button>
        </form>
      </Card>
    </div>
  );
}
