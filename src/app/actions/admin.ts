"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { issueResetCode } from "@/lib/accounts";
import { type Result, int, paise, run, str } from "@/lib/action";
import { AppError, audit, db, setSetting } from "@/lib/db";
import * as E from "@/lib/engage";
import * as L from "@/lib/ledger";
import type { PlanLine } from "@/lib/plan";
import { PUBLIC_KEYS } from "@/lib/public";
import { receiptMessages } from "@/lib/messages";
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
  return run(() => {
    const memberId = int(fd, "memberId");
    let lines: PlanLine[] | null = null;
    if (str(fd, "split") === "custom") {
      const parsed = JSON.parse(str(fd, "lines") || "[]") as PlanLine[];
      if (!Array.isArray(parsed)) throw new AppError("allocationInvalid");
      lines = parsed.map((l) => ({ chargeId: l.chargeId ? Number(l.chargeId) : undefined, month: l.month ?? null, amount: Number(l.amount) }));
    }
    const r = L.recordPayment({
      memberId,
      amount: paise(fd, "amount"),
      paidOn: str(fd, "paidOn"),
      method: str(fd, "method") as L.Method,
      reference: str(fd, "reference"),
      note: str(fd, "note"),
      lines,
      idempotencyKey: str(fd, "key") || null,
      actorId: admin.id,
    });
    refresh();
    // Read back what was actually saved, so the confirmation shows stored values, not the form's.
    const p = db().prepare("SELECT amount_paise, paid_on, method, unallocated_paise FROM payment_balances WHERE id = ?").get(r.paymentId) as { amount_paise: number; paid_on: string; method: L.Method; unallocated_paise: number };
    const months = (db().prepare("SELECT c.period_month FROM allocations a JOIN charges c ON c.id = a.charge_id WHERE a.payment_id = ? AND c.kind = 'monthly' ORDER BY c.period_month").all(r.paymentId) as { period_month: string }[]).map((x) => x.period_month);
    const balance = L.balanceOf(memberId).outstanding;
    const name = (db().prepare("SELECT name FROM users WHERE id = ?").get(memberId) as { name: string }).name;
    return {
      ...r,
      memberId,
      amount: p.amount_paise,
      paidOn: p.paid_on,
      method: p.method,
      months,
      credit: p.unallocated_paise,
      balance,
      receipt: receiptMessages({ name, amount: p.amount_paise, date: p.paid_on, method: p.method, months, credit: p.unallocated_paise, balance }),
    };
  }, fd);
}

export async function reversePaymentAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => {
    L.reversePayment(int(fd, "paymentId"), str(fd, "reason"), admin.id);
    refresh();
  }, fd);
}

export async function waiveAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => {
    L.waiveCharge(int(fd, "chargeId"), paise(fd, "amount"), str(fd, "reason"), admin.id);
    refresh();
  }, fd);
}

export async function reverseWaiverAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => {
    L.reverseWaiver(int(fd, "waiverId"), str(fd, "reason"), admin.id);
    refresh();
  }, fd);
}

export async function addChargeAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => {
    const kind = str(fd, "kind") === "opening" ? "opening" : "manual";
    L.addCharge({ memberId: int(fd, "memberId"), kind, amount: paise(fd, "amount"), description: str(fd, "description"), periodMonth: str(fd, "periodMonth") || null, actorId: admin.id });
    refresh();
  }, fd);
}

export async function setStatusAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => {
    L.setMemberStatus(int(fd, "memberId"), str(fd, "status") as L.MemberStatus, str(fd, "effectiveMonth"), str(fd, "reason") || null, admin.id);
    refresh();
  }, fd);
}

// ───────────────────────────── claims & approvals ─────────────────────────────

export async function confirmClaimAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => {
    L.confirmClaim(int(fd, "claimId"), admin.id);
    refresh();
  }, fd);
}

export async function linkClaimAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => {
    L.linkClaim(int(fd, "claimId"), int(fd, "paymentId"), admin.id);
    refresh();
  }, fd);
}

export async function rejectClaimAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => {
    L.rejectClaim(int(fd, "claimId"), str(fd, "reason"), admin.id);
    refresh();
  }, fd);
}

export async function approveAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => {
    const dues = str(fd, "openingAmount") ? paise(fd, "openingAmount") : 0;
    if (dues > 0 && !str(fd, "openingNote")) throw new AppError("reasonRequired", "openingNote");
    L.approveMember(int(fd, "userId"), { billingStartMonth: str(fd, "billingStartMonth"), openingDues: dues > 0 ? { amount: dues, note: str(fd, "openingNote") } : null, actorId: admin.id });
    refresh();
  }, fd);
}

export async function rejectRegistrationAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => {
    L.rejectRegistration(int(fd, "userId"), str(fd, "reason"), admin.id);
    refresh();
  }, fd);
}

// ───────────────────────────── member care ─────────────────────────────

export async function visitAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => {
    E.adminSetVisit(int(fd, "memberId"), str(fd, "date"), str(fd, "present") === "1", str(fd, "reason"), admin.id);
    refresh();
  }, fd);
}

export async function onboardingAction(memberId: number, item: string, done: boolean) {
  const admin = await requireAdmin();
  E.toggleOnboarding(memberId, item, done, admin.id);
  refresh();
}

export async function followupPrefAction(memberId: number, on: boolean) {
  const admin = await requireAdmin();
  db().prepare("UPDATE members SET followup_opt_in = ? WHERE user_id = ?").run(on ? 1 : 0, memberId);
  audit(admin.id, "member.followup_pref", { memberId, detail: { on } });
  refresh();
}

export async function resetCodeAction(_: Result<{ code: string; expires: string }> | null, fd: FormData): Promise<Result<{ code: string; expires: string }>> {
  const admin = await requireAdmin();
  return run(() => {
    const { code, expires } = issueResetCode(int(fd, "memberId"), admin.id);
    return { code, expires: expires.toISOString() };
  }, fd);
}

export async function helpAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => {
    E.updateHelpRequest(int(fd, "id"), str(fd, "status") === "resolved" ? "resolved" : "acknowledged", str(fd, "note") || null, admin.id);
    refresh();
  }, fd);
}

// ───────────────────────────── challenge ─────────────────────────────

export async function startChallengeAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => {
    const template = str(fd, "template") as E.Challenge["template"];
    if (template === "buddy" && fd.get("approve") !== "on") throw new AppError("offerNotApproved", "approve");
    E.startChallenge({ template, targetVisits: int(fd, "targetVisits") || null, offerText: str(fd, "offerText"), actorId: admin.id });
    refresh();
  }, fd);
}

export async function endChallengeAction(fd: FormData) {
  const admin = await requireAdmin();
  E.endChallenge(int(fd, "id"), admin.id);
  refresh();
}

export async function buddyDoneAction(challengeId: number, memberId: number, done: boolean) {
  const admin = await requireAdmin();
  E.markBuddyComplete(challengeId, memberId, done, admin.id);
  refresh();
}

// ───────────────────────────── settings ─────────────────────────────

export async function billingSettingsAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => {
    const launch = str(fd, "launchMonth");
    const dueDay = int(fd, "dueDay");
    if (!isMonth(launch)) throw new AppError("monthInvalid", "launchMonth");
    if (!(dueDay >= 1 && dueDay <= 28)) throw new AppError("invalidInput", "dueDay");
    setSetting("launch_month", launch);
    setSetting("due_day", String(dueDay));
    // First setup: start the fee schedule at the pilot price unless Bharat has already set one.
    if (!db().prepare("SELECT 1 FROM fee_schedule LIMIT 1").get())
      db().prepare("INSERT INTO fee_schedule (effective_month, amount_paise, created_at) VALUES (?, 50000, ?)").run(launch, new Date().toISOString());
    audit(admin.id, "settings.updated", { detail: { launch, dueDay } });
    L.generateCharges();
    L.invalidateBillingCache();
    refresh();
  }, fd);
}

export async function feeAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => {
    const month = str(fd, "effectiveMonth");
    const amount = paise(fd, "fee");
    if (!isMonth(month)) throw new AppError("monthInvalid", "effectiveMonth");
    if (amount <= 0) throw new AppError("amountInvalid", "fee");
    // Charges already created keep their stored amount; this only affects months billed later.
    db().prepare("INSERT INTO fee_schedule (effective_month, amount_paise, created_at) VALUES (?, ?, ?) ON CONFLICT(effective_month) DO UPDATE SET amount_paise = excluded.amount_paise").run(month, amount, new Date().toISOString());
    audit(admin.id, "settings.updated", { detail: { fee: amount, from: month } });
    L.generateCharges();
    refresh();
  }, fd);
}

export async function followupSettingsAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => {
    const days = int(fd, "inactivityDays");
    const cool = int(fd, "cooldownDays");
    if (!(days >= 3 && days <= 60) || !(cool >= 1 && cool <= 60)) throw new AppError("invalidInput");
    setSetting("inactivity_days", String(days));
    setSetting("followup_cooldown_days", String(cool));
    audit(admin.id, "settings.updated", { detail: { days, cool } });
    refresh();
  }, fd);
}

export async function publicInfoAction(_: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => {
    for (const k of PUBLIC_KEYS) {
      let v = str(fd, k).slice(0, 1200);
      if (k === "mapUrl" && v && !/^https:\/\//.test(v)) throw new AppError("invalidInput", k);
      if ((k === "phone" || k === "whatsapp") && v) v = v.replace(/[^\d+ ]/g, "");
      setSetting(`pub_${k}`, v);
    }
    audit(admin.id, "settings.updated", { detail: "public page" });
    refresh();
  }, fd);
}

export async function rotateCheckinAction() {
  const admin = await requireAdmin();
  setSetting("checkin_key", crypto.randomBytes(9).toString("base64url"));
  audit(admin.id, "settings.updated", { detail: "check-in QR rotated" });
  refresh();
}

export async function runBillingAction(_: Result<number> | null): Promise<Result<number>> {
  await requireAdmin();
  return run(() => {
    const n = L.generateCharges();
    refresh();
    return n;
  });
}
