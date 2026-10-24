"use client";

import { useState, useTransition } from "react";
import { Check, Flag, Trophy, UserPlus, Undo2 } from "lucide-react";
import { buddyDoneAction, startChallengeAction } from "@/app/actions/admin";
import { FormError, Sheet, SheetForm, SubmitButton, useFieldError } from "@/components/client";
import { useI18n } from "@/components/i18n-provider";
import { Field, btn, cx, inputCls } from "@/components/ui";

const ICONS = { target: Trophy, back_on_track: Flag, buddy: UserPlus };

export function StartChallenge({ hasCurrent }: { hasCurrent: boolean }) {
  const { t } = useI18n();
  const [tpl, setTpl] = useState<"target" | "back_on_track" | "buddy">("target");
  return (
    <Sheet
      title={t("challenge.start")}
      description={t("challenge.sub")}
      trigger={(open) => (
        <button type="button" onClick={open} className={btn({ variant: hasCurrent ? "secondary" : "primary", size: "md", block: !hasCurrent })}>
          <Trophy className="size-5" aria-hidden />
          {t("challenge.start")}
        </button>
      )}
    >
      {(close) => (
        <SheetForm action={startChallengeAction} successMessage={t("settings.saved")} onDone={close}>
          {(state) => <Fields state={state} tpl={tpl} setTpl={setTpl} />}
        </SheetForm>
      )}
    </Sheet>
  );
}

function Fields({ state, tpl, setTpl }: { state: Parameters<typeof useFieldError>[0]; tpl: "target" | "back_on_track" | "buddy"; setTpl: (v: "target" | "back_on_track" | "buddy") => void }) {
  const { t } = useI18n();
  const err = useFieldError(state);
  return (
    <>
      <FormError state={state} fields={["approve"]} />
      <fieldset className="space-y-2">
        <legend className="sr-only">{t("challenge.title")}</legend>
        {(["target", "back_on_track", "buddy"] as const).map((k) => {
          const Icon = ICONS[k];
          return (
            <label key={k} className={cx("flex cursor-pointer items-start gap-3 rounded-[16px] border-2 p-3.5 transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-volt/60", tpl === k ? "border-ink-950 bg-white" : "border-sand-200 bg-sand-50")}>
              <input type="radio" name="template" value={k} checked={tpl === k} onChange={() => setTpl(k)} className="sr-only" />
              <span className={cx("grid size-10 shrink-0 place-items-center rounded-[12px]", tpl === k ? "bg-volt text-ink-950" : "bg-sand-200 text-ink-600")}>
                <Icon className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block font-semibold text-ink-950">{t(`challenge.templates.${k}.title`)}</span>
                <span className="block text-[14px] text-ink-600">{t(`challenge.templates.${k}.body`, { n: 6, offer: "" })}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {tpl === "back_on_track" && (
        <Field label={t("challenge.targetVisits")} htmlFor="tv">
          <input id="tv" name="targetVisits" type="number" min={1} max={31} defaultValue={6} inputMode="numeric" className={inputCls} />
        </Field>
      )}
      {tpl === "buddy" && (
        <>
          <Field label={t("challenge.offer")} htmlFor="offer">
            <input id="offer" name="offerText" maxLength={200} placeholder={t("challenge.offerPlaceholder")} className={inputCls} required />
          </Field>
          <label className="flex min-h-12 items-center gap-3 text-[15px] font-medium text-ink-900">
            <input type="checkbox" name="approve" className="size-6 accent-ink-950" />
            {t("challenge.offerApprove")}
          </label>
          {err("approve") && <p className="text-[14px] font-medium text-bad">{err("approve")}</p>}
        </>
      )}
      <SubmitButton pendingLabel={t("common.saving")}>{t("challenge.start")}</SubmitButton>
    </>
  );
}

export function BuddyToggle({ challengeId, memberId, done }: { challengeId: number; memberId: number; done: boolean }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => buddyDoneAction(challengeId, memberId, !done))} className={btn({ variant: done ? "ghost" : "secondary", size: "sm" })}>
      {done ? <Undo2 className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}
      {done ? t("challenge.completed") : t("challenge.markDone")}
    </button>
  );
}
