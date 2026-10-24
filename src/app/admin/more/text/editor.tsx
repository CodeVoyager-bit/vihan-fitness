"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { ChevronRight, RotateCcw, Search, SearchX } from "lucide-react";
import { saveTextAction } from "@/app/actions/admin";
import { FormError, Sheet, SheetForm, SubmitButton, useFieldError } from "@/components/client";
import { useI18n } from "@/components/i18n-provider";
import { Badge, Card, EmptyState, Field, cx, inputCls } from "@/components/ui";
import { type Lang, LANGS, type TKey } from "@/lib/i18n";
import { allTextKeys, defaultText } from "@/lib/site-config";

type Edits = Record<string, Partial<Record<Lang, string>>>;
const PAGE = 50;

export function WordingEditor({ edits }: { edits: Edits }) {
  const { t, lang } = useI18n();
  const keys = useMemo(() => allTextKeys(), []);
  const sections = useMemo(() => [...new Set(keys.map((k) => k.split(".")[0]))], [keys]);
  const [q, setQ] = useState("");
  const [section, setSection] = useState("");
  const [editedOnly, setEditedOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const dq = useDeferredValue(q.trim().toLowerCase());
  const current = (k: string, l: Lang) => edits[k]?.[l] ?? defaultText(l, k) ?? "";
  const shown = useMemo(
    () =>
      keys.filter(
        (k) =>
          (!section || k.startsWith(`${section}.`)) &&
          (!editedOnly || edits[k]) &&
          (!dq || k.toLowerCase().includes(dq) || LANGS.some((l) => current(k, l).toLowerCase().includes(dq))),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `current` only reads `edits`
    [keys, section, editedOnly, dq, edits],
  );
  const sectionName = (s: string) => {
    const name = t(`site.text.sections.${s}` as TKey);
    return name.startsWith("site.text.sections.") ? s : name;
  };

  return (
    <>
      <div className="sticky top-0 z-20 -mx-4 space-y-2 bg-sand-100/95 px-4 pb-3 pt-1 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <label className="relative block">
          <span className="sr-only">{t("site.text.search")}</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-500" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => (setQ(e.target.value), setLimit(PAGE))}
            placeholder={t("site.text.search")}
            autoComplete="off"
            className="block min-h-12 w-full rounded-[14px] border border-sand-300 bg-white pl-11 pr-3.5 text-[16px] placeholder:text-ink-400 focus:border-ink-900 focus:outline-none focus:ring-4 focus:ring-volt/40"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select value={section} onChange={(e) => (setSection(e.target.value), setLimit(PAGE))} aria-label={t("site.text.all")} className={cx(inputCls, "min-h-11 w-auto max-w-[60%] py-2")}>
            <option value="">{t("site.text.all")}</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                {sectionName(s)}
              </option>
            ))}
          </select>
          <label className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-ink-800">
            <input type="checkbox" checked={editedOnly} onChange={(e) => (setEditedOnly(e.target.checked), setLimit(PAGE))} className="size-5 accent-ink-950" />
            {t("site.text.editedOnly")}
          </label>
          <span className="ml-auto text-[13px] text-ink-500" aria-live="polite">
            {t("site.text.count", { n: shown.length })}
          </span>
        </div>
      </div>

      <p className="mb-3 text-[14px] text-ink-600">
        {t("site.placeholdersHint")} {t("site.text.otherLangs")}
      </p>

      {shown.length === 0 ? (
        <EmptyState icon={SearchX} title={t("site.text.empty")} />
      ) : (
        <Card as="ul" className="divide-y divide-sand-200">
          {shown.slice(0, limit).map((k) => (
            <li key={k}>
              <Sheet
                title={t("site.text.edit")}
                description={`${sectionName(k.split(".")[0])} · ${k.split(".").slice(1).join(" › ")}`}
                trigger={(open) => (
                  <button type="button" onClick={open} className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-sand-50">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-ink-500">
                        {sectionName(k.split(".")[0])}
                        {edits[k] && <Badge tone="info">{t("site.text.edited")}</Badge>}
                      </span>
                      <span lang={lang} className="mt-0.5 line-clamp-2 text-[15px] text-ink-950">
                        {current(k, lang)}
                      </span>
                    </span>
                    <ChevronRight className="mt-3 size-5 shrink-0 text-ink-400" aria-hidden />
                  </button>
                )}
              >
                {(close) => <TextForm k={k} values={Object.fromEntries(LANGS.map((l) => [l, current(k, l)])) as Record<Lang, string>} onDone={close} />}
              </Sheet>
            </li>
          ))}
        </Card>
      )}
      {shown.length > limit && (
        <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="mx-auto mt-3 flex min-h-11 items-center px-4 text-[15px] font-semibold text-ink-800 underline underline-offset-2">
          {t("common.showMore")}
        </button>
      )}
    </>
  );
}

function TextForm({ k, values, onDone }: { k: string; values: Record<Lang, string>; onDone: () => void }) {
  const { t } = useI18n();
  return (
    <SheetForm action={saveTextAction.bind(null, k)} successMessage={t("settings.saved")} onDone={onDone}>
      {(state) => <TextFields k={k} values={values} state={state} />}
    </SheetForm>
  );
}

function TextFields({ k, values, state }: { k: string; values: Record<Lang, string>; state: Parameters<typeof useFieldError>[0] }) {
  const { t } = useI18n();
  const err = useFieldError(state);
  const [draft, setDraft] = useState(values);
  return (
    <>
      <FormError state={state} fields={LANGS.map((l) => `t.${l}.${k}`)} />
      {LANGS.map((l) => {
        const name = `t.${l}.${k}`;
        const original = defaultText(l, k) ?? "";
        return (
          <div key={l} className="space-y-1">
            <Field label={t(`langs.${l}`)} htmlFor={name.replace(/\./g, "-")} error={err(name)}>
              <textarea
                id={name.replace(/\./g, "-")}
                name={name}
                lang={l}
                defaultValue={values[l]}
                rows={Math.min(6, Math.max(2, Math.ceil(values[l].length / 60)))}
                maxLength={2000}
                onChange={(e) => setDraft((d) => ({ ...d, [l]: e.target.value }))}
                className={cx(inputCls, "min-h-16")}
              />
            </Field>
            {draft[l] !== original && (
              <div className="flex items-start gap-2 text-[13px] text-ink-600">
                <span className="min-w-0 flex-1" lang={l}>
                  <span className="font-semibold">{t("site.text.original")}:</span> {original}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById(name.replace(/\./g, "-")) as HTMLTextAreaElement | null;
                    if (el) el.value = original;
                    setDraft((d) => ({ ...d, [l]: original }));
                  }}
                  className="inline-flex min-h-8 shrink-0 items-center gap-1 font-semibold text-ink-800 underline underline-offset-2"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  {t("site.text.reset")}
                </button>
              </div>
            )}
          </div>
        );
      })}
      <SubmitButton variant="dark" pendingLabel={t("common.saving")}>
        {t("common.save")}
      </SubmitButton>
    </>
  );
}
