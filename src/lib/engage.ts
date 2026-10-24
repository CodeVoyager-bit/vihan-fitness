import { AppError, audit, db, nowIso, settingInt, tx } from "./db";
import { statusAt } from "./ledger";
import { addDays, currentMonth, daysBetween, isDate, todayIST } from "./time";

// ───────────────────────────── attendance ─────────────────────────────

/** One recorded visit per member per Asia/Kolkata day. Self-reported, so it is never proof of presence. */
export function checkIn(memberId: number, source: "qr" | "app", now = new Date()): { created: boolean; date: string } {
  const date = todayIST(now);
  if (statusAt(memberId, date.slice(0, 7)) !== "active") throw new AppError("checkinNotActive");
  const r = db()
    .prepare("INSERT OR IGNORE INTO attendance (member_id, visit_date, recorded_at, source) VALUES (?, ?, ?, ?)")
    .run(memberId, date, now.toISOString(), source);
  return { created: r.changes === 1, date };
}

export function adminSetVisit(memberId: number, date: string, present: boolean, reason: string, actorId: number) {
  if (!isDate(date) || date > todayIST()) throw new AppError("dateInvalid", "date");
  if (!reason.trim()) throw new AppError("reasonRequired", "reason");
  tx(() => {
    const r = present
      ? db()
          .prepare("INSERT OR IGNORE INTO attendance (member_id, visit_date, recorded_at, source, created_by) VALUES (?, ?, ?, 'admin', ?)")
          .run(memberId, date, nowIso(), actorId)
      : db().prepare("DELETE FROM attendance WHERE member_id = ? AND visit_date = ?").run(memberId, date);
    if (r.changes) audit(actorId, present ? "visit.added" : "visit.removed", { memberId, detail: { date, reason: reason.trim() } });
  });
}

export function visitDates(memberId: number, month: string): string[] {
  return (
    db().prepare("SELECT visit_date FROM attendance WHERE member_id = ? AND visit_date LIKE ? ORDER BY visit_date").all(memberId, `${month}-%`) as {
      visit_date: string;
    }[]
  ).map((r) => r.visit_date);
}

export function lastVisit(memberId: number): string | null {
  return (db().prepare("SELECT MAX(visit_date) AS d FROM attendance WHERE member_id = ?").get(memberId) as { d: string | null }).d;
}

// ───────────────────────────── goals ─────────────────────────────

export const GOAL_OPTIONS = [4, 8, 12, 16, 20];
export const DEFAULT_GOAL = 12;

/** The goal chosen for this month, else the most recent earlier choice carries over. */
export function goalFor(memberId: number, month = currentMonth()): { target: number; chosen: boolean } {
  const r = db()
    .prepare("SELECT target_visits FROM goals WHERE member_id = ? AND month <= ? ORDER BY month DESC LIMIT 1")
    .get(memberId, month) as { target_visits: number } | undefined;
  return r ? { target: r.target_visits, chosen: true } : { target: DEFAULT_GOAL, chosen: false };
}

export function setGoal(memberId: number, target: number) {
  if (!GOAL_OPTIONS.includes(target)) throw new AppError("goalInvalid");
  db()
    .prepare("INSERT INTO goals (member_id, month, target_visits) VALUES (?, ?, ?) ON CONFLICT(member_id, month) DO UPDATE SET target_visits = excluded.target_visits")
    .run(memberId, currentMonth(), target);
}

// ───────────────────────────── follow-ups ─────────────────────────────

export type FollowUp = { id: number; name: string; phone: string; language: string; last_visit: string | null; since: string; days: number; last_prompt: string | null };

/**
 * Active, opted-in members whose last *recorded* visit is older than the threshold, minus anyone
 * Bharat already opened a follow-up for within the cooldown window.
 */
export function followUpCandidates(today = todayIST()): FollowUp[] {
  const threshold = settingInt("inactivity_days", 8);
  const cooldown = settingInt("followup_cooldown_days", 7);
  const rows = db()
    .prepare(
      `SELECT u.id, u.name, u.phone, u.language, u.reviewed_at,
         (SELECT MAX(visit_date) FROM attendance a WHERE a.member_id = u.id) AS last_visit,
         (SELECT MAX(opened_at) FROM reminder_opens r WHERE r.member_id = u.id AND r.kind = 'attendance') AS last_prompt
       FROM users u JOIN members m ON m.user_id = u.id
       WHERE u.status = 'approved' AND m.followup_opt_in = 1`,
    )
    .all() as (Omit<FollowUp, "since" | "days"> & { reviewed_at: string })[];
  const month = today.slice(0, 7);
  const cutoff = addDays(today, -cooldown);
  return rows
    .filter((r) => statusAt(r.id, month) === "active")
    .map((r) => {
      const since = r.last_visit ?? r.reviewed_at.slice(0, 10);
      return { ...r, since, days: daysBetween(since, today) };
    })
    .filter((r) => r.days >= threshold && (!r.last_prompt || r.last_prompt.slice(0, 10) < cutoff))
    .sort((a, b) => b.days - a.days);
}

export function logReminderOpen(memberId: number, kind: "fee" | "attendance" | "receipt", language: string, actorId: number) {
  db().prepare("INSERT INTO reminder_opens (member_id, kind, language, opened_by, opened_at) VALUES (?, ?, ?, ?, ?)").run(memberId, kind, language, actorId, nowIso());
}

// ───────────────────────────── onboarding ─────────────────────────────

export const ONBOARDING_ITEMS = ["meet", "goals", "equipment", "routine", "firstWeek"] as const;
export type OnboardingItem = (typeof ONBOARDING_ITEMS)[number];

export function onboardingDone(memberId: number): Set<string> {
  return new Set((db().prepare("SELECT item FROM onboarding WHERE member_id = ?").all(memberId) as { item: string }[]).map((r) => r.item));
}

export function toggleOnboarding(memberId: number, item: string, done: boolean, actorId: number) {
  if (!ONBOARDING_ITEMS.includes(item as OnboardingItem)) throw new AppError("invalidInput");
  if (done) db().prepare("INSERT OR IGNORE INTO onboarding (member_id, item, done_at, done_by) VALUES (?, ?, ?, ?)").run(memberId, item, nowIso(), actorId);
  else db().prepare("DELETE FROM onboarding WHERE member_id = ? AND item = ?").run(memberId, item);
}

// ───────────────────────────── help requests ─────────────────────────────

export function createHelpRequest(memberId: number, topic: "routine" | "general", message: string | null) {
  if (!["routine", "general"].includes(topic)) throw new AppError("invalidInput");
  const open = db().prepare("SELECT COUNT(*) AS n FROM help_requests WHERE member_id = ? AND status <> 'resolved'").get(memberId) as { n: number };
  if (open.n >= 3) throw new AppError("tooManyHelpRequests");
  const r = db()
    .prepare("INSERT INTO help_requests (member_id, topic, message, created_at) VALUES (?, ?, ?, ?)")
    .run(memberId, topic, message?.trim().slice(0, 500) || null, nowIso());
  audit(memberId, "help.requested", { memberId, entity: "help", entityId: r.lastInsertRowid, detail: { topic } });
}

export function updateHelpRequest(id: number, status: "acknowledged" | "resolved", note: string | null, actorId: number) {
  const col = status === "acknowledged" ? "acknowledged_at" : "resolved_at";
  const r = db()
    .prepare(`UPDATE help_requests SET status = ?, ${col} = ?, admin_note = COALESCE(?, admin_note) WHERE id = ? AND status <> 'resolved'`)
    .run(status, nowIso(), note?.trim() || null, id);
  if (!r.changes) throw new AppError("helpNotFound");
  const m = db().prepare("SELECT member_id FROM help_requests WHERE id = ?").get(id) as { member_id: number };
  audit(actorId, `help.${status}`, { memberId: m.member_id, entity: "help", entityId: id });
}

// ───────────────────────────── challenges ─────────────────────────────

export type Challenge = { id: number; month: string; template: "target" | "back_on_track" | "buddy"; target_visits: number | null; offer_text: string | null };

export function activeChallenge(month = currentMonth()): Challenge | null {
  return (db().prepare("SELECT * FROM challenges WHERE month = ? AND active = 1 ORDER BY id DESC LIMIT 1").get(month) as Challenge | undefined) ?? null;
}

export function startChallenge(o: { template: Challenge["template"]; targetVisits?: number | null; offerText?: string | null; actorId: number }) {
  if (!["target", "back_on_track", "buddy"].includes(o.template)) throw new AppError("invalidInput");
  if (o.template === "back_on_track" && !(o.targetVisits && o.targetVisits >= 1 && o.targetVisits <= 31)) throw new AppError("goalInvalid");
  // The buddy visit offer only runs with Bharat's own words for the offer.
  if (o.template === "buddy" && !o.offerText?.trim()) throw new AppError("offerRequired");
  const month = currentMonth();
  tx(() => {
    db().prepare("UPDATE challenges SET active = 0 WHERE month = ?").run(month);
    const r = db()
      .prepare("INSERT INTO challenges (month, template, target_visits, offer_text, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(month, o.template, o.template === "back_on_track" ? o.targetVisits : null, o.template === "buddy" ? o.offerText!.trim() : null, o.actorId, nowIso());
    audit(o.actorId, "challenge.started", { entity: "challenge", entityId: r.lastInsertRowid, detail: { template: o.template } });
  });
}

export function endChallenge(id: number, actorId: number) {
  db().prepare("UPDATE challenges SET active = 0 WHERE id = ?").run(id);
  audit(actorId, "challenge.ended", { entity: "challenge", entityId: id });
}

export function joinChallenge(challengeId: number, memberId: number, showName: boolean) {
  const c = activeChallenge();
  if (!c || c.id !== challengeId) throw new AppError("challengeNotActive");
  db()
    .prepare("INSERT INTO challenge_entries (challenge_id, member_id, joined_at, show_name) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET show_name = excluded.show_name")
    .run(challengeId, memberId, nowIso(), showName ? 1 : 0);
}

export function leaveChallenge(challengeId: number, memberId: number) {
  db().prepare("DELETE FROM challenge_entries WHERE challenge_id = ? AND member_id = ?").run(challengeId, memberId);
}

/** Progress is derived from recorded visits; buddy completion is marked by Bharat. */
export function challengeProgress(c: Challenge, memberId: number): { target: number | null; done: number; complete: boolean } {
  const visits = visitDates(memberId, c.month).length;
  if (c.template === "buddy") {
    const e = db().prepare("SELECT completed_at FROM challenge_entries WHERE challenge_id = ? AND member_id = ?").get(c.id, memberId) as
      | { completed_at: string | null }
      | undefined;
    return { target: null, done: 0, complete: !!e?.completed_at };
  }
  const target = c.template === "target" ? goalFor(memberId, c.month).target : c.target_visits!;
  return { target, done: visits, complete: visits >= target };
}

export function markBuddyComplete(challengeId: number, memberId: number, done: boolean, actorId: number) {
  db().prepare("UPDATE challenge_entries SET completed_at = ? WHERE challenge_id = ? AND member_id = ?").run(done ? nowIso() : null, challengeId, memberId);
  audit(actorId, "challenge.buddy", { memberId, entity: "challenge", entityId: challengeId, detail: { done } });
}

export function challengeEntries(c: Challenge) {
  const rows = db()
    .prepare("SELECT e.member_id, e.show_name, e.joined_at, u.name FROM challenge_entries e JOIN users u ON u.id = e.member_id WHERE e.challenge_id = ? ORDER BY u.name")
    .all(c.id) as { member_id: number; show_name: number; joined_at: string; name: string }[];
  return rows.map((r) => ({ ...r, progress: challengeProgress(c, r.member_id) }));
}

/** Opt-in recognition only: first names of finishers who chose to be shown. No ranking. */
export function recognitionWall(c: Challenge): string[] {
  return challengeEntries(c)
    .filter((e) => e.show_name && e.progress.complete)
    .map((e) => e.name.split(" ")[0]);
}
