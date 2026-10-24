"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { setLanguage } from "@/lib/accounts";
import { logReminderOpen } from "@/lib/engage";
import { isLang } from "@/lib/i18n";
import { LANG_COOKIE } from "@/lib/i18n/server";
import { isMember } from "@/lib/queries";
import { endSession, getUser, requireAdmin } from "@/lib/session";

export async function setLanguageAction(lang: string) {
  if (!isLang(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const u = await getUser();
  if (u) await setLanguage(u.id, lang);
}

export async function logReminderAction(memberId: number, kind: "fee" | "attendance" | "receipt", lang: string) {
  const admin = await requireAdmin();
  if (!Number.isInteger(memberId) || !["fee", "attendance", "receipt"].includes(kind) || !isLang(lang)) return;
  if (!(await isMember(memberId))) return;
  await logReminderOpen(memberId, kind, lang, admin.id);
  revalidatePath("/admin", "layout");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
