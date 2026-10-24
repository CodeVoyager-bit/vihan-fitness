"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { billingSettingsAction, feeAction, followupSettingsAction, publicInfoAction, runBillingAction } from "@/app/actions/admin";
import { changePasswordAction } from "@/app/actions/member";
import { FormError, PasswordInput, SheetForm, SubmitButton, useFieldError } from "@/components/client";
import { useI18n } from "@/components/i18n-provider";
import { Field, Notice, cx, inputCls } from "@/components/ui";
import type { TKey } from "@/lib/i18n";

export function BillingForm({ launch, dueDay }: { launch: string; dueDay: number }) {
  const { t } = useI18n();
  return (
    <SheetForm action={billingSettingsAction} successMessage={t("settings.saved")}>
      {(state) => (
        <>
          <FormError state={state} fields={[]} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("settings.launchMonth")} htmlFor="launchMonth" hint={t("settings.launchHelp")}>
              <input id="launchMonth" name="launchMonth" type="month" defaultValue={launch} required className={inputCls} />
            </Field>
            <Field label={t("settings.dueDay")} htmlFor="dueDay" hint={t("settings.dueHelp")}>
              <input id="dueDay" name="dueDay" type="number" min={1} max={28} defaultValue={dueDay} inputMode="numeric" required className={inputCls} />
            </Field>
          </div>
          <SubmitButton variant="dark" size="md" block={false} pendingLabel={t("common.saving")}>
            {t("common.save")}
          </SubmitButton>
        </>
      )}
    </SheetForm>
  );
}

export function FeeForm({ nextMonth }: { nextMonth: string }) {
  const { t } = useI18n();
  return (
    <SheetForm action={feeAction} successMessage={t("settings.saved")}>
      {(state) => <FeeFields state={state} nextMonth={nextMonth} />}
    </SheetForm>
  );
}

function FeeFields({ state, nextMonth }: { state: Parameters<typeof useFieldError>[0]; nextMonth: string }) {
  const { t } = useI18n();
  const err = useFieldError(state);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("settings.fee")} htmlFor="fee" error={err("fee")}>
          <input id="fee" name="fee" inputMode="decimal" placeholder="500" required className={inputCls} />
        </Field>
        <Field label={t("settings.feeFrom")} htmlFor="effectiveMonth" error={err("effectiveMonth")}>
          <input id="effectiveMonth" name="effectiveMonth" type="month" defaultValue={nextMonth} required className={inputCls} />
        </Field>
      </div>
      <p className="text-[13px] text-ink-500">{t("settings.feeHelp")}</p>
      <SubmitButton variant="secondary" size="md" block={false} pendingLabel={t("common.saving")}>
        {t("common.save")}
      </SubmitButton>
    </>
  );
}

export function RunBilling() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(runBillingAction, null);
  return (
    <form action={action} className="space-y-2">
      <button disabled={pending} className={cx("inline-flex min-h-11 items-center gap-2 rounded-[14px] border border-sand-300 bg-sand-0 px-4 font-semibold text-ink-900 transition hover:bg-white disabled:opacity-50")}>
        <RefreshCw className={cx("size-4", pending && "animate-spin")} aria-hidden />
        {t("settings.runBilling")}
      </button>
      <p className="text-[13px] text-ink-500">{t("settings.runBillingHelp")}</p>
      {state?.ok && <Notice tone="ok">{t("settings.billingDone", { n: Number(state.data ?? 0) })}</Notice>}
    </form>
  );
}

export function FollowupForm({ days, cooldown }: { days: number; cooldown: number }) {
  const { t } = useI18n();
  return (
    <SheetForm action={followupSettingsAction} successMessage={t("settings.saved")}>
      {(state) => (
        <>
          <FormError state={state} />
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("settings.inactivityDays")} htmlFor="inactivityDays">
              <input id="inactivityDays" name="inactivityDays" type="number" min={3} max={60} defaultValue={days} inputMode="numeric" className={inputCls} />
            </Field>
            <Field label={t("settings.cooldownDays")} htmlFor="cooldownDays">
              <input id="cooldownDays" name="cooldownDays" type="number" min={1} max={60} defaultValue={cooldown} inputMode="numeric" className={inputCls} />
            </Field>
          </div>
          <SubmitButton variant="dark" size="md" block={false} pendingLabel={t("common.saving")}>
            {t("common.save")}
          </SubmitButton>
        </>
      )}
    </SheetForm>
  );
}

const LONG = new Set(["about", "trainer", "joining", "address"]);

export function PublicForm({ values }: { values: Record<string, string> }) {
  const { t } = useI18n();
  return (
    <SheetForm action={publicInfoAction} successMessage={t("settings.saved")}>
      {(state) => (
        <>
          <FormError state={state} />
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.keys(values).map((k) => (
              <div key={k} className={LONG.has(k) ? "sm:col-span-2" : ""}>
                <Field label={t(`settings.pub.${k}` as TKey)} htmlFor={`pub-${k}`} optional optionalLabel={t("common.optional")}>
                  {LONG.has(k) ? (
                    <textarea id={`pub-${k}`} name={k} defaultValue={values[k]} rows={3} maxLength={1200} className={cx(inputCls, "min-h-24")} />
                  ) : (
                    <input id={`pub-${k}`} name={k} defaultValue={values[k]} maxLength={300} inputMode={k === "phone" || k === "whatsapp" ? "tel" : k === "since" ? "numeric" : undefined} className={inputCls} />
                  )}
                </Field>
              </div>
            ))}
          </div>
          <SubmitButton variant="dark" size="md" block={false} pendingLabel={t("common.saving")}>
            {t("common.save")}
          </SubmitButton>
        </>
      )}
    </SheetForm>
  );
}

export function PasswordForm() {
  const { t } = useI18n();
  return (
    <SheetForm action={changePasswordAction} successMessage={t("settings.saved")}>
      {(state) => <PasswordFields state={state} />}
    </SheetForm>
  );
}

function PasswordFields({ state }: { state: Parameters<typeof useFieldError>[0] }) {
  const { t } = useI18n();
  const err = useFieldError(state);
  return (
    <>
      <FormError state={state} fields={["current", "password", "confirm"]} />
      <Field label={t("settings.currentPassword")} htmlFor="current" error={err("current")}>
        <PasswordInput id="current" name="current" autoComplete="current-password" />
      </Field>
      <Field label={t("auth.newPassword")} htmlFor="np" hint={t("auth.passwordHint")} error={err("password")}>
        <PasswordInput id="np" name="password" autoComplete="new-password" />
      </Field>
      <Field label={t("auth.confirmPassword")} htmlFor="cp" error={err("confirm")}>
        <PasswordInput id="cp" name="confirm" autoComplete="new-password" />
      </Field>
      <SubmitButton variant="dark" size="md" block={false} pendingLabel={t("common.saving")}>
        {t("settings.changePassword")}
      </SubmitButton>
    </>
  );
}
