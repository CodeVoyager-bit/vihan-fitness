"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, LifeBuoy, Loader2, MapPin, PartyPopper } from "lucide-react";
import { checkInAction, joinChallengeAction, leaveChallengeAction, myOnboardingAction, quickHelpAction, setGoalAction } from "@/app/actions/member";
import { FormError, Sheet, SubmitButton, toast } from "@/components/client";
import { useI18n } from "@/components/i18n-provider";
import { btn, cx } from "@/components/ui";

/** Confirm, then record today's visit. The sheet shows the saved result, never an optimistic one. */
export function CheckInButton({ dateLabel, done, qrKey, autoOpen, target }: { dateLabel: string; done: boolean; qrKey?: string; autoOpen?: boolean; target: number }) {
  const { t } = useI18n();
  return (
    <Sheet
      title={t("member.checkIn")}
      defaultOpen={autoOpen}
      trigger={(open) =>
        done ? (
          <span className="inline-flex min-h-12 items-center gap-2 rounded-[14px] bg-white/10 px-4 font-semibold text-volt">
            <Check className="size-5" strokeWidth={3} aria-hidden />
            {t("member.checkedIn")}
          </span>
        ) : (
          <button type="button" onClick={open} className={cx(btn({ variant: "primary", size: "lg" }), "shadow-[0_8px_24px_-8px_rgb(200_242_60/0.6)]")}>
            <MapPin className="size-5" aria-hidden />
            {t("member.checkIn")}
          </button>
        )
      }
    >
      {(close) => <CheckInBody dateLabel={dateLabel} qrKey={qrKey} target={target} close={close} />}
    </Sheet>
  );
}

/** Mounted while the sheet is open: keeps the saved confirmation on screen through the page refresh. */
function CheckInBody({ dateLabel, qrKey, target, close }: { dateLabel: string; qrKey?: string; target: number; close: () => void }) {
  const { t } = useI18n();
  const [state, action] = useActionState(checkInAction, null);
  return state?.ok ? (
    <div className="pb-2 text-center" role="status">
      <span className="animate-pop mx-auto grid size-24 place-items-center rounded-full bg-volt text-ink-950 shadow-[0_0_0_10px_rgb(200_242_60/0.25)]">
        {state.data?.created ? <PartyPopper className="size-11" aria-hidden /> : <Check className="size-11" strokeWidth={3} aria-hidden />}
      </span>
      <p className="mt-5 font-display text-[34px] font-extrabold leading-[1.05] text-ink-950">{state.data?.created ? t("member.checkInSaved") : t("member.checkedIn")}</p>
      <p className="mt-2 text-[17px] text-ink-700">{state.data?.created ? t("member.progress", { done: state.data.count, target }) : t("member.checkInAlready")}</p>
      <button type="button" onClick={close} className={cx(btn({ variant: "dark", size: "lg", block: true }), "mt-6")}>
        {t("common.done")}
      </button>
    </div>
  ) : (
    <form action={action} className="space-y-4">
      {qrKey && <input type="hidden" name="k" value={qrKey} />}
      <p className="text-[19px] font-semibold text-ink-950">{t("member.checkInConfirm", { date: dateLabel })}</p>
      <p className="text-[15px] text-ink-600">{t("member.checkInHelp")}</p>
      <FormError state={state} />
      <SubmitButton pendingLabel={t("common.saving")}>
        <MapPin className="size-5" aria-hidden />
        {t("member.checkIn")}
      </SubmitButton>
    </form>
  );
}

export function GoalPicker({ options, current }: { options: number[]; current: number }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [value, setValue] = useOptimistic(current);
  return (
    <div role="group" aria-label={t("attendance.chooseGoal")} className={cx("grid grid-cols-5 gap-2", pending && "opacity-70")}>
      {options.map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          onClick={() =>
            start(async () => {
              setValue(n);
              await setGoalAction(n);
              toast(t("attendance.goalSaved"));
            })
          }
          className={cx(
            "flex min-h-14 flex-col items-center justify-center rounded-[14px] border-2 font-display text-[24px] font-bold leading-none tabular transition",
            value === n ? "border-ink-950 bg-ink-950 text-volt" : "border-sand-300 bg-sand-0 text-ink-800 hover:border-ink-300",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function HelpQuick() {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await quickHelpAction();
            if (r.ok) {
              toast(t("help.sent"));
              router.push("/app/help");
            } else setError(r.error === "somethingWrong" ? t("common.somethingWrong") : t(`errors.${r.error}` as "errors.invalidInput"));
          })
        }
        className="flex min-h-16 w-full items-center gap-3 rounded-[var(--radius-xl)] border border-sand-200 bg-sand-0 px-4 text-left shadow-[var(--shadow-card)] transition hover:border-ink-300 active:scale-[0.99]"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-info-soft text-info">{pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <LifeBuoy className="size-5" aria-hidden />}</span>
        <span className="flex-1 text-[16px] font-semibold text-ink-950">{t("member.needHelp")}</span>
      </button>
      {error && <p role="alert" className="mt-2 px-1 text-[14px] font-medium text-bad">{error}</p>}
    </>
  );
}

export function ChallengeJoin({ challengeId, joined, showName }: { challengeId: number; joined: boolean; showName: boolean }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [show, setShow] = useState(showName);
  if (!joined)
    return (
      <div className="space-y-3">
        <label className="flex min-h-11 items-center gap-3 text-[15px] text-ink-800">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="size-5 accent-ink-950" />
          {t("challenge.showName")}
        </label>
        <button type="button" disabled={pending} onClick={() => start(() => joinChallengeAction(challengeId, show))} className={btn({ variant: "dark", size: "md", block: true })}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {t("challenge.join")}
        </button>
      </div>
    );
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ok">
        <Check className="size-4" strokeWidth={3} aria-hidden />
        {t("challenge.joined")}
      </span>
      <button type="button" disabled={pending} onClick={() => start(() => leaveChallengeAction(challengeId))} className={btn({ variant: "ghost", size: "sm" })}>
        {t("challenge.leave")}
      </button>
    </div>
  );
}

export function MyChecklist({ items }: { items: { key: string; label: string; done: boolean }[] }) {
  const [pending, start] = useTransition();
  return (
    <ul className={cx("space-y-1", pending && "opacity-70")}>
      {items.map((i) => (
        <li key={i.key}>
          <button
            type="button"
            role="checkbox"
            aria-checked={i.done}
            onClick={() => start(() => myOnboardingAction(i.key, !i.done))}
            className="flex min-h-12 w-full items-center gap-3 rounded-[14px] px-2 text-left transition hover:bg-sand-100"
          >
            <span className={cx("grid size-7 shrink-0 place-items-center rounded-full border-2 transition", i.done ? "border-ink-950 bg-volt text-ink-950" : "border-sand-300 bg-white")}>
              {i.done && <Check className="size-4" strokeWidth={3} aria-hidden />}
            </span>
            <span className={cx("text-[15px] font-medium", i.done ? "text-ink-500 line-through decoration-ink-300" : "text-ink-900")}>{i.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
