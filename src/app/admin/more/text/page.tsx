import type { Metadata } from "next";
import { WordingEditor } from "./editor";
import { PageHeader } from "@/components/ui";
import { settingsByPrefix } from "@/lib/db";
import { type Lang, isLang } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requireAdmin } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("site.pages.text.title") };
}

/** Admin → More → All wording: change any label or message; the shipped texts stay as the fallback. */
export default async function WordingPage() {
  await requireAdmin();
  const { t } = await getT();
  // Only the edits travel to the browser; the original texts are already in the app's dictionaries.
  const edits: Record<string, Partial<Record<Lang, string>>> = {};
  for (const [k, v] of await settingsByPrefix(["text."])) {
    const [, l, ...rest] = k.split(".");
    if (isLang(l)) (edits[rest.join(".")] ??= {})[l] = v;
  }
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("site.pages.text.title")} sub={t("site.pages.text.sub")} back={{ href: "/admin/more", label: t("nav.more") }} />
      <WordingEditor edits={edits} />
    </div>
  );
}
