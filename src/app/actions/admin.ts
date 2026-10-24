"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { issueResetCode } from "@/lib/accounts";
import { type Result, int, paise, run, str } from "@/lib/action";
import { AppError, audit, setSetting } from "@/lib/db";
import * as E from "@/lib/engage";
import * as L from "@/lib/ledger";
import type { PlanLine } from "@/lib/plan";
import { setMemberPhoto, setSitePhoto } from "@/lib/photos";
import { savePage, saveText } from "@/lib/site";
import { PAGE_IDS, type PageId } from "@/lib/site-config";
import { allT } from "@/lib/i18n/server";
import { receiptMessages } from "@/lib/messages";
import { setFollowupOptIn } from "@/lib/queries";
import { isMonth } from "@/lib/time";
import { requireAdmin } from "@/lib/session";

const refresh = () => revalidatePath("/", "layout");

// ───────────────────────────── payments ─────────────────────────────

export type SavedPayment = {
  paymentId: number;
  duplicate: boolean;
  memberId: number;
  amount: number;
  paidOn: string;
  method: L.Method;
  months: string[];
  credit: number;
  balance: number;
  receipt: Record<"en" | "mr" | "hi", string>;
};

export async function recordPaymentAction(_: Result<SavedPayment> | null, fd: FormData): Promise<Result<SavedPayment>> {
  const admin = await requireAdmin();
  return run(async () => {
    const memberId = int(fd, "memberId");
    let lines: PlanLine[] | null = null;
    if (str(fd, "split") === "custom") {
      const parsed = JSON.parse(str(fd, "lines") || "[]") as PlanLine[];
      if (!Array.isArray(parsed)) throw new AppError("allocationInvalid");
      lines = parsed.map((l) => ({ chargeId: l.chargeId ? Number(l.chargeId) : undefined, month: l.month ?? null, amount: Number(l.amount) }));
    }
    const r = await L.recordPayment({
      memberId,
      amount: paise(fd, "amount"),
      paidOn: str(fd, "paidOn"),
      method: str(fd, "method") as L.Method,
      reference: str(fd, "reference"),
      note: str(fd, "note"),
      lines,
      idempotencyKey: str(fd, "key").startsWith("claim:") ? null : str(fd, "key") || null, // claim keys are reserved
      actorId: admin.id,
    });
    refresh();
    // Read back what was actually saved, so the confirmation shows stored values, not the form's.
    const p = await L.paymentSummary(r.paymentId);
    const balance = (await L.balanceOf(memberId)).outstanding;
    return {
      ...r,
      memberId,
      amount: p.amount,
      paidOn: p.paidOn,
      method: p.method,
      months: p.months,
      credit: p.credit,
      balance,
      receipt: receiptMessages(await allT(), { name: p.name, amount: p.amount, date: p.paidOn, method: p.method, months: p.months, credit: p.credit, balance }),
    };
  }, fd);
}

export async function reversePaymentAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    await L.reversePayment(int(fd, "paymentId"), str(fd, "reason"), admin.id);
    refresh();
  }, fd);
}

export async function waiveAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    await L.waiveCharge(int(fd, "chargeId"), paise(fd, "amount"), str(fd, "reason"), admin.id);
    refresh();
  }, fd);
}

export async function reverseWaiverAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    await L.reverseWaiver(int(fd, "waiverId"), str(fd, "reason"), admin.id);
    refresh();
  }, fd);
}

export async function addChargeAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    const kind = str(fd, "kind") === "opening" ? "opening" : "manual";
    await L.addCharge({ memberId: int(fd, "memberId"), kind, amount: paise(fd, "amount"), description: str(fd, "description"), periodMonth: str(fd, "periodMonth") || null, actorId: admin.id });
    refresh();
  }, fd);
}

export async function setStatusAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    await L.setMemberStatus(int(fd, "memberId"), str(fd, "status") as L.MemberStatus, str(fd, "effectiveMonth"), str(fd, "reason") || null, admin.id);
    refresh();
  }, fd);
}

// ───────────────────────────── claims & approvals ─────────────────────────────

export async function confirmClaimAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    await L.confirmClaim(int(fd, "claimId"), admin.id);
    refresh();
  }, fd);
}

export async function linkClaimAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    await L.linkClaim(int(fd, "claimId"), int(fd, "paymentId"), admin.id);
    refresh();
  }, fd);
}

export async function rejectClaimAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    await L.rejectClaim(int(fd, "claimId"), str(fd, "reason"), admin.id);
    refresh();
  }, fd);
}

export async function approveAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    const dues = str(fd, "openingAmount") ? paise(fd, "openingAmount") : 0;
    if (dues > 0 && !str(fd, "openingNote")) throw new AppError("reasonRequired", "openingNote");
    await L.approveMember(int(fd, "userId"), { billingStartMonth: str(fd, "billingStartMonth"), openingDues: dues > 0 ? { amount: dues, note: str(fd, "openingNote") } : null, actorId: admin.id });
    refresh();
  }, fd);
}

export async function rejectRegistrationAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    await L.rejectRegistration(int(fd, "userId"), str(fd, "reason"), admin.id);
    refresh();
  }, fd);
}

// ───────────────────────────── member care ─────────────────────────────

export async function visitAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    await E.adminSetVisit(int(fd, "memberId"), str(fd, "date"), str(fd, "present") === "1", str(fd, "reason"), admin.id);
    refresh();
  }, fd);
}

export async function onboardingAction(memberId: number, item: string, done: boolean) {
  const admin = await requireAdmin();
  if (!Number.isInteger(memberId) || typeof done !== "boolean") return;
  await E.toggleOnboarding(memberId, item, done, admin.id);
  refresh();
}

export async function followupPrefAction(memberId: number, on: boolean) {
  const admin = await requireAdmin();
  if (!Number.isInteger(memberId) || typeof on !== "boolean") return;
  await setFollowupOptIn(memberId, on);
  await audit(admin.id, "member.followup_pref", { memberId, detail: { on } });
  refresh();
}

export async function resetCodeAction(_: Result<{ code: string; expires: string }> | null, fd: FormData): Promise<Result<{ code: string; expires: string }>> {
  const admin = await requireAdmin();
  return run(async () => {
    const { code, expires } = await issueResetCode(int(fd, "memberId"), admin.id);
    return { code, expires: expires.toISOString() };
  }, fd);
}

export async function helpAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    await E.updateHelpRequest(int(fd, "id"), str(fd, "status") === "resolved" ? "resolved" : "acknowledged", str(fd, "note") || null, admin.id);
    refresh();
  }, fd);
}

// ───────────────────────────── challenge ─────────────────────────────

export async function startChallengeAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    const template = str(fd, "template") as E.Challenge["template"];
    if (template === "buddy" && fd.get("approve") !== "on") throw new AppError("offerNotApproved", "approve");
    await E.startChallenge({ template, targetVisits: int(fd, "targetVisits") || null, offerText: str(fd, "offerText"), actorId: admin.id });
    refresh();
  }, fd);
}

export async function endChallengeAction(fd: FormData) {
  const admin = await requireAdmin();
  await E.endChallenge(int(fd, "id"), admin.id);
  refresh();
}

export async function buddyDoneAction(challengeId: number, memberId: number, done: boolean) {
  const admin = await requireAdmin();
  if (!Number.isInteger(challengeId) || !Number.isInteger(memberId) || typeof done !== "boolean") return;
  await E.markBuddyComplete(challengeId, memberId, done, admin.id);
  refresh();
}

// ───────────────────────────── settings ─────────────────────────────

export async function billingSettingsAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    await L.setBillingSettings(str(fd, "launchMonth"), int(fd, "dueDay"), admin.id);
    refresh();
  }, fd);
}

export async function feeAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    const month = str(fd, "effectiveMonth");
    const amount = paise(fd, "fee");
    if (!isMonth(month)) throw new AppError("monthInvalid", "effectiveMonth");
    if (amount <= 0) throw new AppError("amountInvalid", "fee");
    // Charges already created keep their stored amount; this only affects months billed later.
    await L.setFee(month, amount, admin.id);
    refresh();
  }, fd);
}

export async function followupSettingsAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    const days = int(fd, "inactivityDays");
    const cool = int(fd, "cooldownDays");
    if (!(days >= 3 && days <= 60) || !(cool >= 1 && cool <= 60)) throw new AppError("invalidInput");
    await setSetting("inactivity_days", String(days));
    await setSetting("followup_cooldown_days", String(cool));
    await audit(admin.id, "settings.updated", { detail: { days, cool } });
    refresh();
  }, fd);
}

// Admin → More → Brand / Website / Contact / Messages / Rules: every field is validated against the
// schema in src/lib/site-config.ts. The page comes bound from the server-rendered form.
export async function saveSiteAction(page: PageId, _: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    if (!PAGE_IDS.includes(page)) throw new AppError("invalidInput");
    const keys = await savePage(page, fd);
    await audit(admin.id, "settings.updated", { detail: { page, keys: keys.length } });
    refresh();
  }, fd);
}

/** All wording: one text in all three languages. Blank or unchanged = back to the original. */
export async function saveTextAction(key: string, _: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    await saveText(String(key), fd);
    await audit(admin.id, "settings.updated", { detail: { text: String(key).slice(0, 120) } });
    refresh();
  }, fd);
}

// Photos: no `photo` in the form removes it. The id/slot comes bound from the server-rendered page.
export async function memberPhotoAction(memberId: number, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    await setMemberPhoto(memberId, fd.get("photo"), admin.id);
    refresh();
  });
}

export async function sitePhotoAction(slot: string, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    await setSitePhoto(slot, fd.get("photo"), admin.id);
    refresh();
  });
}

export async function rotateCheckinAction() {
  const admin = await requireAdmin();
  await setSetting("checkin_key", crypto.randomBytes(9).toString("base64url"));
  await audit(admin.id, "settings.updated", { detail: "check-in QR rotated" });
  refresh();
}

export async function runBillingAction(): Promise<Result<number>> {
  await requireAdmin();
  return run(async () => {
    const n = await L.generateCharges();
    refresh();
    return n;
  });
}
