"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { myFollowupPrefAction } from "@/app/actions/member";
import { setLanguageAction } from "@/app/actions/common";
import { useI18n } from "@/components/i18n-provider";
import { Segmented, cx } from "@/components/ui";

export function ProfileLang() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className={cx(pending && "opacity-60")}>
      <Segmented
        name="lang"
        legend={t("common.language")}
        value={lang}
        onChange={(v) => start(async () => (await setLanguageAction(v), router.refresh()))}
        options={[
          { value: "en", label: "English" },
          { value: "mr", label: "मराठी" },
          { value: "hi", label: "हिन्दी" },
        ]}
      />
    </div>
  );
}

export function FollowupPref({ on }: { on: boolean }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  return (
    <div className={cx(pending && "opacity-60")}>
      <Segmented
        name="followup"
        legend={t("profile.followups")}
        value={on ? "on" : "off"}
        onChange={(v) => start(() => myFollowupPrefAction(v === "on"))}
        options={[
          { value: "on", label: t("profile.followupsOn") },
          { value: "off", label: t("profile.followupsOff") },
        ]}
      />
    </div>
  );
}
