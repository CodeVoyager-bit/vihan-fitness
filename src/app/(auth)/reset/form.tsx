"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { resetAction } from "@/app/actions/auth";
import { FormError, PasswordInput, SubmitButton, useFieldError, useKept } from "@/components/client";
import { useI18n } from "@/components/i18n-provider";
import { Field, inputCls } from "@/components/ui";

export function ResetForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [state, action] = useActionState(resetAction, null);
  const err = useFieldError(state);
  const kept = useKept(state);
  useEffect(() => {
    if (state?.ok) router.push("/login?reset=1");
  }, [state, router]);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError state={state} fields={["phone", "code", "password", "confirm"]} />
      <Field label={t("auth.phone")} htmlFor="phone" error={err("phone")}>
        <input id="phone" name="phone" defaultValue={kept("phone")} type="tel" inputMode="tel" autoComplete="tel-national" required className={inputCls} />
      </Field>
      <Field label={t("auth.resetCode")} htmlFor="code" hint={t("auth.resetCodeHint")} error={err("code")}>
        <input id="code" lang="en" name="code" defaultValue={kept("code")} autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} required maxLength={12} className={`${inputCls} font-display text-xl uppercase tracking-[0.2em]`} aria-describedby="code-hint code-error" />
      </Field>
      <Field label={t("auth.newPassword")} htmlFor="password" hint={t("auth.passwordHint")} error={err("password")}>
        <PasswordInput id="password" name="password" autoComplete="new-password" invalid={!!err("password")} />
      </Field>
      <Field label={t("auth.confirmPassword")} htmlFor="confirm" error={err("confirm")}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" invalid={!!err("confirm")} />
      </Field>
      <SubmitButton pendingLabel={t("common.saving")}>{t("auth.resetDo")}</SubmitButton>
    </form>
  );
}
