import type { Metadata } from "next";
import { CheckCircle2, Trophy } from "lucide-react";
import { BuddyToggle, StartChallenge } from "./actions-ui";
import { endChallengeAction } from "@/app/actions/admin";
import { ConfirmAction } from "@/components/client";
import { Avatar, Badge, Bar, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { activeChallenge, challengeEntries } from "@/lib/engage";
import { fmtMonth } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { getRules } from "@/lib/site";
import { requireAdmin } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("challenge.title") };
}

export default async function ChallengePage() {
  await requireAdmin();
  const { t, lang } = await getT();
  const { backOnTrack } = await getRules();
  const c = await activeChallenge();
  const entries = c ? await challengeEntries(c) : [];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("challenge.title")} sub={t("challenge.sub")} back={{ href: "/admin/more", label: t("nav.more") }} />
      {!c ? (
        <EmptyState icon={Trophy} title={t("challenge.none")} action={<StartChallenge hasCurrent={false} suggested={backOnTrack} />} />
      ) : (
        <>
          <Card className="dark-surface overflow-hidden border-0 bg-ink-950 p-5 text-sand-0">
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-volt">{t("challenge.current")} · {fmtMonth(c.month, lang, "long")}</p>
            <h2 className="mt-1 font-display text-[34px] font-extrabold leading-[1.05]">{t(`challenge.templates.${c.template}.title`)}</h2>
            <p className="mt-2 text-[15px] text-sand-0/80">{t(`challenge.templates.${c.template}.body`, { n: c.target_visits ?? 0, offer: c.offer_text ?? "" })}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StartChallenge hasCurrent suggested={backOnTrack} />
              <ConfirmAction action={endChallengeAction} fields={{ id: c.id }} label={t("challenge.end")} title={t("challenge.end")} confirmLabel={t("challenge.end")} className="min-h-12 text-sand-0 hover:bg-white/10" />
            </div>
          </Card>
          <SectionTitle>
            {t("challenge.participants")} · {entries.length}
          </SectionTitle>
          {entries.length === 0 ? (
            <p className="px-1 text-ink-500">{t("challenge.noParticipants")}</p>
          ) : (
            <Card as="ul" className="divide-y divide-sand-200">
              {entries.map((e) => (
                <li key={e.member_id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={e.name} photo={e.photo} size="sm" tone={e.progress.complete ? "volt" : "sand"} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold text-ink-950">
                      {e.name}
                      {e.progress.complete && (
                        <Badge tone="ok" icon={CheckCircle2}>
                          {t("challenge.completed")}
                        </Badge>
                      )}
                    </p>
                    {e.progress.target ? (
                      <div className="mt-1.5 flex items-center gap-3">
                        <div className="flex-1">
                          <Bar value={e.progress.done} max={e.progress.target} label={t("challenge.progress", { done: e.progress.done, target: e.progress.target })} />
                        </div>
                        <span className="text-[13px] font-semibold text-ink-600 tabular">
                          {e.progress.done}/{e.progress.target}
                        </span>
                      </div>
                    ) : (
                      <p className="text-[14px] text-ink-600">{t("challenge.buddyPending")}</p>
                    )}
                  </div>
                  {c.template === "buddy" && <BuddyToggle challengeId={c.id} memberId={e.member_id} done={e.progress.complete} />}
                </li>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
