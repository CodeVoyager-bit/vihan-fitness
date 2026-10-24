"use server";

import { revalidatePath } from "next/cache";
import { changePassword } from "@/lib/accounts";
import { type Result, paise, run, str } from "@/lib/action";
import { AppError, db, setting } from "@/lib/db";
import * as E from "@/lib/engage";
import { submitClaim, type Method } from "@/lib/ledger";
import { requireMember, requireUser } from "@/lib/session";

// Member actions never take a member id from the client: it always comes from the session.
const refresh = () => revalidatePath("/", "layout");

export async function checkInAction(_: Result<{ created: boolean; count: number }> | null, fd: FormData): Promise<Result<{ created: boolean; count: number }>> {
  const me = await requireMember();
  return run(() => {
    const key = str(fd, "k");
    // From the door QR the key must match the current poster; the in-app button sends no key.
    if (key && key !== setting("checkin_key")) throw new AppError("checkinBadCode");
    const r = E.checkIn(me.id, key ? "qr" : "app");
    refresh();
    return { created: r.created, count: E.visitDates(me.id, r.date.slice(0, 7)).length };
  }, fd);
}

export async function setGoalAction(target: number) {
  const me = await requireMember();
  E.setGoal(me.id, target);
  refresh();
}

export async function submitClaimAction(_: Result<{ amount: number }> | null, fd: FormData): Promise<Result<{ amount: number }>> {
  const me = await requireMember();
  return run(() => {
    const amount = paise(fd, "amount");
    submitClaim(me.id, { amount, paidOn: str(fd, "paidOn"), method: str(fd, "method") as Method, reference: str(fd, "reference"), note: str(fd, "note") });
    refresh();
    return { amount };
  }, fd);
}

export async function helpRequestAction(_: Result | null, fd: FormData): Promise<Result> {
  const me = await requireMember();
  return run(() => {
    E.createHelpRequest(me.id, str(fd, "topic") === "general" ? "general" : "routine", str(fd, "message") || null);
    refresh();
  }, fd);
}

export async function quickHelpAction(): Promise<Result> {
  const me = await requireMember();
  return run(() => {
    E.createHelpRequest(me.id, "routine", null);
    refresh();
  });
}

export async function myFollowupPrefAction(on: boolean) {
  const me = await requireMember();
  db().prepare("UPDATE members SET followup_opt_in = ? WHERE user_id = ?").run(on ? 1 : 0, me.id);
  refresh();
}

export async function myOnboardingAction(item: string, done: boolean) {
  const me = await requireMember();
  E.toggleOnboarding(me.id, item, done, me.id);
  refresh();
}

export async function joinChallengeAction(challengeId: number, showName: boolean) {
  const me = await requireMember();
  E.joinChallenge(challengeId, me.id, showName);
  refresh();
}

export async function leaveChallengeAction(challengeId: number) {
  const me = await requireMember();
  E.leaveChallenge(challengeId, me.id);
  refresh();
}

export async function changePasswordAction(_: Result | null, fd: FormData): Promise<Result> {
  const me = await requireUser();
  return run(async () => {
    if (String(fd.get("password")) !== String(fd.get("confirm"))) throw new AppError("passwordMismatch", "confirm");
    await changePassword(me.id, String(fd.get("current") ?? ""), String(fd.get("password") ?? ""));
  }, fd);
}
