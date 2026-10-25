import { cache } from "react";
import { AppError, all, audit, db, inMonth, nextId, nowIso, settingInt, tx } from "./db";
import { getRules } from "./site";
import { screenMembers, screenStatuses, statusAt, statusRowIn } from "./ledger";
import { addDays, currentMonth, daysBetween, isDate, istDate, todayIST } from "./time";

// ───────────────────────────── attendance ─────────────────────────────

/** One recorded visit per member per Asia/Kolkata day. Self-reported, so it is never proof of presence. */
export async function checkIn(memberId: number, source: "qr" | "app", now = new Date()): Promise<{ created: boolean; date: string }> {
  const date = todayIST(now);
  if (!(await canCheckIn(memberId, date.slice(0, 7)))) throw new AppError("checkinNotActive");
  const r = await (await db()).attendance.updateOne(
    { member_id: memberId, visit_date: date },
    { $setOnInsert: { recorded_at: now.toISOString(), source, created_by: null } },
    { upsert: true },
  );
  return { created: r.upsertedCount === 1, date };
}

/** Active members, and approved members whose billing simply starts next month, can record visits. */
export async function canCheckIn(memberId: number, month: string): Promise<boolean> {
  const st = await statusAt(memberId, month);
  if (st) return st === "active";
  const m = await (await db()).users.findOne({ uid: memberId }, { projection: { billing_start_month: 1 } });
  return !!m?.billing_start_month && m.billing_start_month > month;
}

export async function adminSetVisit(memberId: number, date: string, present: boolean, reason: string, actorId: number) {
  if (!isDate(date) || date > todayIST()) throw new AppError("dateInvalid", "date");
  if (!reason.trim()) throw new AppError("reasonRequired", "reason");
  await tx(async () => {
    const d = await db();
    const changed = present
      ? (await d.attendance.updateOne({ member_id: memberId, visit_date: date }, { $setOnInsert: { recorded_at: nowIso(), source: "admin", created_by: actorId } }, { upsert: true })).upsertedCount
      : (await d.attendance.deleteOne({ member_id: memberId, visit_date: date })).deletedCount;
    if (changed) await audit(actorId, present ? "visit.added" : "visit.removed", { memberId, detail: { date, reason: reason.trim() } });
  });
}

export async function visitDates(memberId: number, month: string): Promise<string[]> {
  return (await (await db()).attendance.find({ member_id: memberId, visit_date: inMonth(month) }, { sort: { visit_date: 1 }, projection: { visit_date: 1 } }).toArray()).map((r) => r.visit_date);
}

export async function lastVisit(memberId: number): Promise<string | null> {
  return (await (await db()).attendance.findOne({ member_id: memberId }, { sort: { visit_date: -1 }, projection: { visit_date: 1 } }))?.visit_date ?? null;
}

/** Each member's latest recorded visit. Screens only; loaded once per page render. */
export const lastVisits = cache(async (): Promise<Map<number, string>> => {
  // Sorted along the (member_id, visit_date) index, so the server reads one entry per member, not every visit.
  const rows = await (await db()).attendance
    .aggregate<{ _id: number; last: string }>([{ $sort: { member_id: -1, visit_date: -1 } }, { $group: { _id: "$member_id", last: { $first: "$visit_date" } } }])
    .toArray();
  return new Map(rows.map((r) => [r._id, r.last]));
});

// ───────────────────────────── goals ─────────────────────────────

// Goal choices and the default goal are set in Admin → More → Rules.

/** The goal chosen for this month, else the most recent earlier choice carries over, else the gym's default. */
export async function goalFor(memberId: number, month = currentMonth()): Promise<{ target: number; chosen: boolean }> {
  const r = await (await db()).goals.findOne({ member_id: memberId, month: { $lte: month } }, { sort: { month: -1 } });
  return r ? { target: r.target_visits, chosen: true } : { target: (await getRules()).defaultGoal, chosen: false };
}

export async function setGoal(memberId: number, target: number) {
  if (!(await getRules()).goalOptions.includes(target)) throw new AppError("goalInvalid");
  await (await db()).goals.updateOne({ member_id: memberId, month: currentMonth() }, { $set: { target_visits: target } }, { upsert: true });
}

// ───────────────────────────── follow-ups ─────────────────────────────

export type FollowUp = { id: number; name: string; phone: string; photo: string | null; language: string; last_visit: string | null; since: string; days: number; last_prompt: string | null };

/**
 * Active, opted-in members whose last *recorded* visit is older than the threshold, minus anyone
 * Bharat already opened a follow-up for within the cooldown window.
 */
export async function followUpCandidates(today = todayIST()): Promise<FollowUp[]> {
  const d = await db();
  const [threshold, cooldown, members, statuses, visits, prompts] = await all(
    () => settingInt("inactivity_days", 8),
    () => settingInt("followup_cooldown_days", 7),
    async () => (await screenMembers()).filter((u) => u.followup_opt_in === 1),
    () => screenStatuses(),
    () => lastVisits(),
    async () =>
      new Map(
        (await d.reminder_opens.aggregate<{ _id: number; at: string }>([{ $match: { kind: "attendance" } }, { $group: { _id: "$member_id", at: { $max: "$opened_at" } } }]).toArray()).map(
          (r) => [r._id, r.at],
        ),
      ),
  );
  const month = today.slice(0, 7);
  const cutoff = addDays(today, -cooldown);
  return members
    .filter((u) => statusRowIn(statuses.get(u.uid), month)?.status === "active")
    .map((u): FollowUp => {
      const last_visit = visits.get(u.uid) ?? null;
      const since = last_visit ?? istDate(u.reviewed_at!);
      return { id: u.uid, name: u.name, phone: u.phone, photo: u.photo ?? null, language: u.language, last_visit, since, days: daysBetween(since, today), last_prompt: prompts.get(u.uid) ?? null };
    })
    .filter((r) => r.days >= threshold && (!r.last_prompt || istDate(r.last_prompt) < cutoff))
    .sort((a, b) => b.days - a.days);
}

export async function logReminderOpen(memberId: number, kind: "fee" | "attendance" | "receipt", language: string, actorId: number) {
  await (await db()).reminder_opens.insertOne({ _id: await nextId("reminder_opens"), member_id: memberId, kind, language, opened_by: actorId, opened_at: nowIso() });
}

// ───────────────────────────── onboarding ─────────────────────────────

// The checklist items are set in Admin → More → Rules; ticks stay stored even if an item is later removed.

export async function onboardingDone(memberId: number): Promise<Set<string>> {
  return new Set((await (await db()).onboarding.find({ member_id: memberId }, { projection: { item: 1 } }).toArray()).map((r) => r.item));
}

export async function toggleOnboarding(memberId: number, item: string, done: boolean, actorId: number) {
  if (!(await getRules()).checklist.some((i) => i.key === item)) throw new AppError("invalidInput");
  const d = await db();
  if (done) await d.onboarding.updateOne({ member_id: memberId, item }, { $setOnInsert: { done_at: nowIso(), done_by: actorId } }, { upsert: true });
  else await d.onboarding.deleteOne({ member_id: memberId, item });
}

// ───────────────────────────── help requests ─────────────────────────────

export async function createHelpRequest(memberId: number, topic: "routine" | "general", message: string | null) {
  if (!["routine", "general"].includes(topic)) throw new AppError("invalidInput");
  const d = await db();
  if ((await d.help_requests.count({ member_id: memberId, status: { $ne: "resolved" } })) >= (await getRules()).maxHelp) throw new AppError("tooManyHelpRequests");
  const id = await nextId("help_requests");
  await d.help_requests.insertOne({
    _id: id,
    member_id: memberId,
    topic,
    message: message?.trim().slice(0, 500) || null,
    status: "open",
    created_at: nowIso(),
    acknowledged_at: null,
    resolved_at: null,
    admin_note: null,
  });
  await audit(memberId, "help.requested", { memberId, entity: "help", entityId: id, detail: { topic } });
}

export async function updateHelpRequest(id: number, status: "acknowledged" | "resolved", note: string | null, actorId: number) {
  const at = status === "acknowledged" ? { acknowledged_at: nowIso() } : { resolved_at: nowIso() };
  const r = await (await db()).help_requests.findOneAndUpdate({ _id: id, status: { $ne: "resolved" } }, { $set: { status, ...at, ...(note?.trim() ? { admin_note: note.trim() } : {}) } });
  if (!r) throw new AppError("helpNotFound");
  await audit(actorId, `help.${status}`, { memberId: r.member_id, entity: "help", entityId: id });
}

// ───────────────────────────── challenges ─────────────────────────────

export type Challenge = { id: number; month: string; template: "target" | "back_on_track" | "buddy"; target_visits: number | null; offer_text: string | null };

export async function activeChallenge(month = currentMonth()): Promise<Challenge | null> {
  const c = await (await db()).challenges.findOne({ month, active: 1 }, { sort: { _id: -1 } });
  return c && { id: c._id, month: c.month, template: c.template, target_visits: c.target_visits, offer_text: c.offer_text };
}

export async function startChallenge(o: { template: Challenge["template"]; targetVisits?: number | null; offerText?: string | null; actorId: number }) {
  if (!["target", "back_on_track", "buddy"].includes(o.template)) throw new AppError("invalidInput");
  if (o.template === "back_on_track" && !(o.targetVisits && o.targetVisits >= 1 && o.targetVisits <= 31)) throw new AppError("goalInvalid");
  // The buddy visit offer only runs with Bharat's own words for the offer.
  if (o.template === "buddy" && !o.offerText?.trim()) throw new AppError("offerRequired");
  const month = currentMonth();
  await tx(async () => {
    const d = await db();
    await d.challenges.updateMany({ month }, { $set: { active: 0 } });
    const id = await nextId("challenges");
    await d.challenges.insertOne({
      _id: id,
      month,
      template: o.template,
      target_visits: o.template === "back_on_track" ? o.targetVisits! : null,
      offer_text: o.template === "buddy" ? o.offerText!.trim() : null,
      active: 1,
      created_by: o.actorId,
      created_at: nowIso(),
    });
    await audit(o.actorId, "challenge.started", { entity: "challenge", entityId: id, detail: { template: o.template } });
  });
}

export async function endChallenge(id: number, actorId: number) {
  await (await db()).challenges.updateOne({ _id: id }, { $set: { active: 0 } });
  await audit(actorId, "challenge.ended", { entity: "challenge", entityId: id });
}

export async function joinChallenge(challengeId: number, memberId: number, showName: boolean) {
  const c = await activeChallenge();
  if (!c || c.id !== challengeId) throw new AppError("challengeNotActive");
  await (await db()).challenge_entries.updateOne(
    { challenge_id: challengeId, member_id: memberId },
    { $set: { show_name: showName ? 1 : 0 }, $setOnInsert: { joined_at: nowIso(), completed_at: null } },
    { upsert: true },
  );
}

export async function leaveChallenge(challengeId: number, memberId: number) {
  await (await db()).challenge_entries.deleteOne({ challenge_id: challengeId, member_id: memberId });
}

/** The member's entry in a challenge, if they joined. */
export async function challengeEntry(challengeId: number, memberId: number) {
  const e = await (await db()).challenge_entries.findOne({ challenge_id: challengeId, member_id: memberId });
  return e && { show_name: e.show_name };
}

type Progress = { target: number | null; done: number; complete: boolean };

/** Progress is derived from recorded visits; buddy completion is marked by Bharat. */
function progressOf(c: Challenge, visits: number, goal: number | null, completedAt: string | null | undefined, defaultGoal: number): Progress {
  if (c.template === "buddy") return { target: null, done: 0, complete: !!completedAt };
  const target = c.template === "target" ? (goal ?? defaultGoal) : c.target_visits!;
  return { target, done: visits, complete: visits >= target };
}

export async function challengeProgress(c: Challenge, memberId: number): Promise<Progress> {
  const [e, visits, goal] = await all(
    async () => (await db()).challenge_entries.findOne({ challenge_id: c.id, member_id: memberId }),
    () => visitDates(memberId, c.month),
    () => goalFor(memberId, c.month),
  );
  return progressOf(c, visits.length, goal.target, e?.completed_at, goal.target);
}

export async function markBuddyComplete(challengeId: number, memberId: number, done: boolean, actorId: number) {
  await (await db()).challenge_entries.updateOne({ challenge_id: challengeId, member_id: memberId }, { $set: { completed_at: done ? nowIso() : null } });
  await audit(actorId, "challenge.buddy", { memberId, entity: "challenge", entityId: challengeId, detail: { done } });
}

export async function challengeEntries(c: Challenge) {
  const d = await db();
  const entries = await d.challenge_entries.find({ challenge_id: c.id }).toArray();
  const ids = entries.map((e) => e.member_id);
  const [users, visits, goals] = await all(
    () => d.users.find({ uid: { $in: ids } }, { projection: { uid: 1, name: 1, photo: 1 } }).toArray(),
    () => d.attendance.aggregate<{ _id: number; n: number }>([{ $match: { member_id: { $in: ids }, visit_date: inMonth(c.month) } }, { $group: { _id: "$member_id", n: { $sum: 1 } } }]).toArray(),
    () => d.goals.find({ member_id: { $in: ids }, month: { $lte: c.month } }, { sort: { month: -1 } }).toArray(),
  );
  const { defaultGoal } = await getRules();
  const user = new Map(users.map((u) => [u.uid, u]));
  const count = new Map(visits.map((v) => [v._id, v.n]));
  const goal = new Map<number, number>();
  for (const g of goals) if (!goal.has(g.member_id)) goal.set(g.member_id, g.target_visits); // newest first
  return entries
    .map((e) => ({
      member_id: e.member_id,
      show_name: e.show_name,
      joined_at: e.joined_at,
      name: user.get(e.member_id)?.name ?? "",
      photo: user.get(e.member_id)?.photo ?? null,
      progress: progressOf(c, count.get(e.member_id) ?? 0, goal.get(e.member_id) ?? null, e.completed_at, defaultGoal),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Opt-in recognition only: first names of finishers who chose to be shown. No ranking. */
export async function recognitionWall(c: Challenge): Promise<string[]> {
  return (await challengeEntries(c)).filter((e) => e.show_name && e.progress.complete).map((e) => e.name.split(" ")[0]);
}
