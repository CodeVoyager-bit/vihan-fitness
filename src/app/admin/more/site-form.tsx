"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Plus, RotateCcw, Trash2 } from "lucide-react";
import { FormError, SheetForm, SubmitButton, useFieldError } from "@/components/client";
import { useI18n } from "@/components/i18n-provider";
import { Field, cx, inputCls } from "@/components/ui";
import type { Result } from "@/lib/action";
import { type Lang, LANGS, DICTS, type TKey, interpolate, lookup } from "@/lib/i18n";
import { ACCENTS, BRAND_VARS, type ChecklistItem, FIELDS, type FieldId, type SiteField, defaultText, placeholders } from "@/lib/site-config";

type Values = { fields: Record<string, string | Record<Lang, string>>; texts: Record<string, Record<Lang, string>> };
type Props = {
  action: (prev: Result | null, fd: FormData) => Promise<Result>;
  layout: { group: string; items: string[] }[];
  values: Values;
  /** Brand names per language, for the message previews. */
  vars: Record<Lang, Record<string, string>>;
};

const isText = (item: string) => item.includes(".");
const fieldName = (id: string, l?: Lang) => (l ? `f.${id}.${l}` : `f.${id}`);
const textName = (l: Lang, key: string) => `t.${l}.${key}`;
const domId = (name: string) => name.replace(/\./g, "-");
const SAMPLE: Record<string, string> = { amount: "1,000", balance: "0", date: "24 Oct", n: "3", note: "…", year: "2015" };

/** One settings page: language tabs on top, groups of fields below, one Save. */
export function SiteForm({ action, layout, values, vars }: Props) {
  const { t, lang: uiLang } = useI18n();
  return (
    <SheetForm action={action} successMessage={t("settings.saved")}>
      {(state) => <Body state={state} layout={layout} values={values} vars={vars} initialLang={uiLang} />}
    </SheetForm>
  );
}

function Body({ state, layout, values, vars, initialLang }: Omit<Props, "action"> & { state: Result | null; initialLang: Lang }) {
  const { t } = useI18n();
  const [lang, setLang] = useState<Lang>(initialLang);
  const multilingual = layout.some((g) => g.items.some((i) => isText(i) || (FIELDS[i as FieldId] as SiteField).perLang));
  // A failed save may point at a field in another language tab: show that tab.
  useEffect(() => {
    const m = state && !state.ok ? state.field?.match(/(?:^t\.(en|mr|hi)\.|\.(en|mr|hi)$)/) : null;
    if (m) setLang((m[1] ?? m[2]) as Lang); // eslint-disable-line react-hooks/set-state-in-effect -- follows the server's answer
  }, [state]);

  return (
    <>
      {multilingual && (
        <div className="sticky top-0 z-10 -mx-4 bg-sand-0/95 px-4 py-2 backdrop-blur">
          <div role="group" aria-label={t("site.language")} className="grid grid-cols-3 gap-1 rounded-[14px] bg-sand-200/80 p-1">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
                className={cx("min-h-10 rounded-[10px] text-[15px] font-semibold transition", lang === l ? "bg-white text-ink-950 shadow-[var(--shadow-card)]" : "text-ink-600")}
              >
                {t(`langs.${l}`)}
              </button>
            ))}
          </div>
        </div>
      )}
      <FormError state={state} fields={[]} />
      {layout.map((g) => (
        <fieldset key={g.group} className="space-y-4 border-t border-sand-200 pt-5 first-of-type:border-0 first-of-type:pt-0">
          <legend className="mb-1 font-display text-[19px] font-bold text-ink-950">{t(`site.groups.${g.group}` as TKey)}</legend>
          {g.items.map((item) =>
            isText(item) ? (
              <TextItem key={item} k={item} value={values.texts[item]} lang={lang} state={state} vars={vars} />
            ) : (
              <FieldItem key={item} id={item as FieldId} value={values.fields[item]} lang={lang} state={state} />
            ),
          )}
        </fieldset>
      ))}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-10 lg:bottom-4">
        <SubmitButton variant="dark" size="md" pendingLabel={t("common.saving")}>
          {t("common.save")}
        </SubmitButton>
      </div>
    </>
  );
}

function useHint() {
  const { t } = useI18n();
  return (key: string) => {
    const s = t(key as TKey);
    return s === key ? undefined : s;
  };
}

function FieldItem({ id, value, lang, state }: { id: FieldId; value: string | Record<Lang, string>; lang: Lang; state: Result | null }) {
  const { t } = useI18n();
  const hint = useHint();
  const err = useFieldError(state);
  const f: SiteField = FIELDS[id];
  const label = t(`site.fields.${id}` as TKey);
  const help = hint(`site.hints.${id}`) ?? (f.type === "url" ? t("site.hints.social") : undefined);

  if (f.perLang) {
    const v = value as Record<Lang, string>;
    return (
      <>
        {LANGS.map((l) => {
          const name = fieldName(id, l);
          return (
            <div key={l} hidden={l !== lang}>
              <Field label={label} htmlFor={domId(name)} hint={l === "en" ? help : t("site.fallbackHint")} error={err(name)}>
                <Control f={f} name={name} value={v[l]} placeholder={l === "en" ? undefined : v.en} lang={l} />
              </Field>
            </div>
          );
        })}
      </>
    );
  }
  const name = fieldName(id);
  if (f.type === "multi" || f.type === "select" || f.type === "items")
    return (
      <div>
        <p className="mb-1.5 text-[15px] font-semibold text-ink-900">{label}</p>
        {help && <p className="mb-2 text-[14px] text-ink-600">{help}</p>}
        <Choice id={id} f={f} name={name} value={value as string} lang={lang} />
        {err(name) && <p className="mt-1.5 text-[14px] font-medium text-bad">{err(name)}</p>}
      </div>
    );
  return (
    <Field label={label} htmlFor={domId(name)} hint={help} error={err(name)}>
      <Control f={f} name={name} value={value as string} />
    </Field>
  );
}

function Control({ f, name, value, placeholder, lang }: { f: SiteField; name: string; value: string; placeholder?: string; lang?: Lang }) {
  const common = { id: domId(name), name, defaultValue: value, placeholder, lang, className: inputCls };
  if (f.type === "longtext") return <textarea {...common} rows={value.length > 160 ? 5 : 3} maxLength={f.max} className={cx(inputCls, "min-h-24")} />;
  if (f.type === "int") return <input {...common} type="number" min={f.min} max={f.max} inputMode="numeric" />;
  if (f.type === "url") return <input {...common} type="url" inputMode="url" placeholder="https://" maxLength={500} />;
  if (f.type === "phone") return <input {...common} type="tel" inputMode="tel" maxLength={20} />;
  if (f.type === "upi") return <input {...common} autoCapitalize="none" spellCheck={false} placeholder="name@okhdfcbank" maxLength={f.max} />;
  return <input {...common} maxLength={f.type === "intList" ? 60 : f.max} inputMode={f.type === "intList" ? "numeric" : undefined} />;
}

/** Pick-one / pick-many settings: accent swatches, homepage background, shown sections, payment methods. */
function Choice({ id, f, name, value, lang }: { id: FieldId; f: SiteField; name: string; value: string; lang: Lang }) {
  const { t } = useI18n();
  if (f.type === "items") return <ChecklistEditor name={name} value={value} lang={lang} />;
  const label = (o: string) =>
    id === "accent" ? t(`site.accents.${o}` as TKey) : id === "heroBg" ? t(`site.heroBgs.${o}` as TKey) : id === "show" ? t(`site.show.${o}` as TKey) : t(`methods.${o}` as TKey);
  const picked = f.type === "multi" ? value.split(",") : [value];
  return (
    <div className="flex flex-wrap gap-2">
      {f.options!.map((o) => (
        <label key={o} className="relative">
          <input type={f.type === "multi" ? "checkbox" : "radio"} name={name} value={o} defaultChecked={picked.includes(o)} className="peer sr-only" />
          <span className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-sand-300 bg-sand-0 px-3.5 text-[15px] font-semibold text-ink-700 transition peer-checked:border-ink-950 peer-checked:bg-ink-950 peer-checked:text-sand-0 peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-ink-900">
            {id === "accent" && <span aria-hidden className="size-4 rounded-full ring-1 ring-black/10" style={{ background: ACCENTS[o as keyof typeof ACCENTS].volt }} />}
            {label(o)}
          </span>
        </label>
      ))}
      {id === "heroBg" && (
        <a href="/" target="_blank" className="inline-flex min-h-11 items-center gap-1.5 px-2 text-[14px] font-semibold text-ink-700 underline underline-offset-2">
          <ExternalLink className="size-4" aria-hidden />
          {t("site.openSite")}
        </a>
      )}
    </div>
  );
}

/** First-week checklist: labels per language; built-in items may stay blank to keep the standard wording. */
function ChecklistEditor({ name, value, lang }: { name: string; value: string; lang: Lang }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<ChecklistItem[]>(() => JSON.parse(value));
  const set = (i: number, text: string) => setRows((r) => r.map((row, j) => (j === i ? { ...row, label: { ...row.label, [lang]: text } } : row)));
  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(rows)} />
      {rows.map((row, i) => {
        const builtin = lookup(DICTS[lang], `member.onboardingItems.${row.key}`);
        return (
          <div key={`${i}-${row.key}`} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-center text-[14px] font-semibold text-ink-500 tabular">{i + 1}</span>
            <input
              aria-label={`${t("site.checklist.label")} ${i + 1}`}
              value={row.label[lang] ?? ""}
              onChange={(e) => set(i, e.target.value)}
              placeholder={builtin ?? (lang === "en" ? "" : row.label.en)}
              maxLength={60}
              lang={lang}
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
              disabled={rows.length <= 1}
              aria-label={`${t("site.checklist.remove")} ${i + 1}`}
              className="grid size-11 shrink-0 place-items-center rounded-full text-ink-600 transition hover:bg-sand-100 disabled:opacity-30"
            >
              <Trash2 className="size-5" aria-hidden />
            </button>
          </div>
        );
      })}
      {rows.length < 10 && (
        <button type="button" onClick={() => setRows((r) => [...r, { key: "", label: {} }])} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[15px] font-semibold text-ink-800 hover:text-ink-950">
          <Plus className="size-5" aria-hidden />
          {t("site.checklist.add")}
        </button>
      )}
      <p className="text-[13px] text-ink-500">{t("site.checklist.builtinHint")}</p>
    </div>
  );
}

/** A wording override with tap-to-insert placeholders, a back-to-original button and (for messages) a live preview. */
function TextItem({ k, value, lang, state, vars }: { k: string; value: Record<Lang, string>; lang: Lang; state: Result | null; vars: Props["vars"] }) {
  const { t } = useI18n();
  const err = useFieldError(state);
  const [draft, setDraft] = useState(value);
  const label = t(`site.textLabels.${k.replace(/\./g, "_")}` as TKey);
  const message = k.startsWith("whatsapp.");
  return (
    <>
      {LANGS.map((l) => {
        const name = textName(l, k);
        const original = defaultText(l, k) ?? "";
        const chips = [...placeholders(original), ...BRAND_VARS];
        const long = message || original.length > 70 || k.startsWith("meta.");
        const put = (text: string) => {
          const el = document.getElementById(domId(name)) as HTMLTextAreaElement | HTMLInputElement | null;
          if (!el) return;
          el.value = text;
          setDraft((d) => ({ ...d, [l]: text }));
          el.focus();
        };
        const insert = (chip: string) => {
          const el = document.getElementById(domId(name)) as HTMLTextAreaElement | HTMLInputElement | null;
          if (!el) return;
          const at = el.selectionStart ?? el.value.length;
          el.setRangeText(`{${chip}}`, at, el.selectionEnd ?? at, "end");
          setDraft((d) => ({ ...d, [l]: el.value }));
          el.focus();
        };
        return (
          <div key={l} hidden={l !== lang} className="space-y-1.5">
            <Field label={label} htmlFor={domId(name)} error={err(name)}>
              {long ? (
                <textarea id={domId(name)} name={name} defaultValue={value[l]} lang={l} rows={message ? 5 : 3} maxLength={2000} onChange={(e) => setDraft((d) => ({ ...d, [l]: e.target.value }))} className={cx(inputCls, "min-h-24")} />
              ) : (
                <input id={domId(name)} name={name} defaultValue={value[l]} lang={l} maxLength={2000} onChange={(e) => setDraft((d) => ({ ...d, [l]: e.target.value }))} className={inputCls} />
              )}
            </Field>
            <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
              <span className="text-ink-500">{t("site.insert")}</span>
              {chips.map((c) => (
                <button key={c} type="button" onClick={() => insert(c)} className="min-h-8 rounded-full bg-sand-200/80 px-2.5 font-mono font-semibold text-ink-800 hover:bg-sand-300">
                  {`{${c}}`}
                </button>
              ))}
              {draft[l] !== original && (
                <button type="button" onClick={() => put(original)} className="ml-auto inline-flex min-h-8 items-center gap-1 px-1 font-semibold text-ink-700 underline underline-offset-2">
                  <RotateCcw className="size-3.5" aria-hidden />
                  {t("site.text.reset")}
                </button>
              )}
            </div>
            {message && (
              <div className="rounded-[14px] bg-[#e9e2d5] p-3">
                <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-500">{t("site.preview")}</p>
                <p lang={l} className="whitespace-pre-line rounded-[12px] rounded-tl-sm bg-[#d9fdd3] px-3 py-2 text-[15px] text-ink-950 shadow-sm">
                  {interpolate(draft[l], { ...vars[l], ...SAMPLE, name: lookup(DICTS[l], "site.sample.name")!.split(" ")[0], months: lookup(DICTS[l], "site.sample.months")!, method: lookup(DICTS[l], "site.sample.method")! })}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
