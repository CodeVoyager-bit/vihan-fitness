"use client";

import { Dumbbell, MessageSquare } from "lucide-react";
import { helpRequestAction } from "@/app/actions/member";
import { FormError, SheetForm, SubmitButton } from "@/components/client";
import { useI18n } from "@/components/i18n-provider";
import { Field, Segmented, cx, inputCls } from "@/components/ui";

export function HelpForm() {
  const { t } = useI18n();
  return (
    <SheetForm action={helpRequestAction} successMessage={t("help.sent")} onDone={() => (document.getElementById("help-msg") as HTMLTextAreaElement | null)?.form?.reset()}>
      {(state) => (
        <>
          <FormError state={state} />
          <Segmented
            name="topic"
            legend={t("help.topic")}
            defaultValue="routine"
            options={[
              { value: "routine", label: t("helpTopic.routine"), icon: Dumbbell },
              { value: "general", label: t("helpTopic.general"), icon: MessageSquare },
            ]}
          />
          <Field label={t("help.message")} htmlFor="help-msg" optional optionalLabel={t("common.optional")}>
            <textarea id="help-msg" name="message" rows={3} maxLength={500} placeholder={t("help.messagePlaceholder")} className={cx(inputCls, "resize-none")} />
          </Field>
          <SubmitButton pendingLabel={t("common.saving")}>{t("help.send")}</SubmitButton>
        </>
      )}
    </SheetForm>
  );
}
