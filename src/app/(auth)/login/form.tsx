"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { FormError, PasswordInput, SubmitButton, useFieldError, useKept } from "@/components/client";
import { useI18n } from "@/components/i18n-provider";
import { Field, inputCls } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const { t } = useI18n();
  const [state, action] = useActionState(loginAction, null);
  const err = useFieldError(state);
  const kept = useKept(state);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormError state={state} fields={["phone"]} />
      <Field label={t("auth.phone")} htmlFor="phone" hint={t("auth.phoneHint")} error={err("phone")}>
        <input id="phone" name="phone" defaultValue={kept("phone")} type="tel" inputMode="tel" autoComplete="tel-national" required className={inputCls} aria-invalid={!!err("phone") || undefined} aria-describedby="phone-hint phone-error" />
      </Field>
      <Field label={t("auth.password")} htmlFor="password">
        <PasswordInput id="password" name="password" autoComplete="current-password" />
      </Field>
      <SubmitButton pendingLabel={t("auth.loggingIn")}>{t("auth.login")}</SubmitButton>
    </form>
  );
}
