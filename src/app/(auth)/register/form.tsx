"use client";

import { useActionState } from "react";
import { Info } from "lucide-react";
import { registerAction } from "@/app/actions/auth";
import { FormError, PasswordInput, SubmitButton, useFieldError, useKept } from "@/components/client";
import { useI18n } from "@/components/i18n-provider";
import { Field, inputCls, Segmented } from "@/components/ui";
import type { Lang } from "@/lib/i18n";

export function RegisterForm({ lang }: { lang: Lang }) {
  const { t } = useI18n();
  const [state, action] = useActionState(registerAction, null);
  const err = useFieldError(state);
  const kept = useKept(state);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError state={state} fields={["name", "phone", "password", "confirm"]} />
      <Field label={t("auth.name")} htmlFor="name" error={err("name")}>
        <input id="name" name="name" defaultValue={kept("name")} autoComplete="name" required maxLength={60} className={inputCls} aria-invalid={!!err("name") || undefined} />
      </Field>
      <Field label={t("auth.phone")} htmlFor="phone" hint={t("auth.phoneHint")} error={err("phone")}>
        <input id="phone" name="phone" defaultValue={kept("phone")} type="tel" inputMode="tel" autoComplete="tel-national" required className={inputCls} aria-invalid={!!err("phone") || undefined} aria-describedby="phone-hint phone-error" />
      </Field>
      <Field label={t("auth.password")} htmlFor="password" hint={t("auth.passwordHint")} error={err("password")}>
        <PasswordInput id="password" name="password" autoComplete="new-password" invalid={!!err("password")} describedBy="password-hint password-error" />
      </Field>
      <Field label={t("auth.confirmPassword")} htmlFor="confirm" error={err("confirm")}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" invalid={!!err("confirm")} />
      </Field>
      <Segmented
        name="language"
        legend={t("auth.preferredLanguage")}
        defaultValue={kept("language", lang)}
        options={[
          { value: "en", label: "English", lang: "en" },
          { value: "mr", label: "मराठी", lang: "mr" },
          { value: "hi", label: "हिन्दी", lang: "hi" },
        ]}
      />
      <p className="flex items-start gap-2 rounded-[14px] bg-sand-100 px-3.5 py-3 text-[14px] text-ink-700">
        <Info className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden />
        {t("auth.feeNote")}
      </p>
      <SubmitButton pendingLabel={t("auth.registering")}>{t("auth.register")}</SubmitButton>
    </form>
  );
}
