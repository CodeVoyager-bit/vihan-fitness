import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LifeBuoy, LogOut } from "lucide-react";
import { FollowupPref, ProfileLang } from "./widgets";
import { logoutAction } from "@/app/actions/common";
import { myPhotoAction } from "@/app/actions/member";
import { PasswordForm } from "@/app/admin/more/forms";
import { PhotoButtons } from "@/components/client";
import { Avatar, Card, KeyValue, PageHeader, SectionTitle, btn } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { formatPhone } from "@/lib/phone";
import { photosEnabled } from "@/lib/photos";
import { profile } from "@/lib/queries";
import { istDate } from "@/lib/time";
import { requireMember } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("profile.title") };
}

export default async function ProfilePage() {
  const me = await requireMember();
  const { t, lang } = await getT();
  const p = (await profile(me.id))!;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("profile.title")} />
      <Card className="flex items-center gap-4 p-4">
        <Avatar name={p.name} photo={p.photo} size="lg" tone="volt" />
        <div className="min-w-0">
          <p className="truncate text-[20px] font-semibold text-ink-950">{p.name}</p>
          <p className="text-[15px] text-ink-600 tabular">{formatPhone(p.phone)}</p>
          {photosEnabled() && <PhotoButtons action={myPhotoAction} has={!!p.photo} className="mt-2" />}
        </div>
      </Card>
      <Card className="mt-3 px-4 py-1">
        <KeyValue items={[[t("profile.memberSince"), fmtDate(istDate(p.reviewed_at), lang)]]} />
      </Card>

      <SectionTitle>{t("common.language")}</SectionTitle>
      <Card className="p-4">
        <ProfileLang />
      </Card>

      <SectionTitle>{t("profile.followups")}</SectionTitle>
      <Card className="p-4">
        <p className="mb-3 text-[14px] text-ink-600">{t("profile.followupsHelp")}</p>
        <FollowupPref on={!!p.followup_opt_in} />
      </Card>

      <SectionTitle>{t("profile.help")}</SectionTitle>
      <Card as="div">
        <Link href="/app/help" className="flex min-h-14 items-center gap-3 px-4 transition hover:bg-sand-50">
          <LifeBuoy className="size-5 text-info" aria-hidden />
          <span className="flex-1 font-semibold text-ink-950">{t("help.memberTitle")}</span>
          <ChevronRight className="size-5 text-ink-400" aria-hidden />
        </Link>
      </Card>

      <SectionTitle>{t("settings.changePassword")}</SectionTitle>
      <Card className="p-4">
        <PasswordForm />
      </Card>

      <form action={logoutAction} className="mt-6">
        <button className={btn({ variant: "danger", block: true })}>
          <LogOut className="size-5" aria-hidden />
          {t("common.signOut")}
        </button>
      </form>
    </div>
  );
}
