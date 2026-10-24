"use client";

import Link from "next/link";
import { CalendarCheck2, CheckCircle2, Clock, Dumbbell, HandCoins, Languages, LifeBuoy, MapPin, MessageCircle, Phone, QrCode, ReceiptText, Target, ArrowDown, ArrowRight, ImageIcon } from "lucide-react";
import ClickSpark from "@/components/bits/ClickSpark";
import CircularText from "@/components/bits/CircularText";
import CountUp from "@/components/bits/CountUp";
import DecryptedText from "@/components/bits/DecryptedText";
import Magnet from "@/components/bits/Magnet";
import Noise from "@/components/bits/Noise";
import RotatingText from "@/components/bits/RotatingText";
import ScrollReveal from "@/components/bits/ScrollReveal";
import ScrollVelocity from "@/components/bits/ScrollVelocity";
import ShinyText from "@/components/bits/ShinyText";
import SplitText from "@/components/bits/SplitText";
import SpotlightCard from "@/components/bits/SpotlightCard";
import StarBorder from "@/components/bits/StarBorder";
import TiltedCard from "@/components/bits/TiltedCard";
import { Wordmark } from "@/components/brand";
import { HeroBackground } from "./hero-bg";
import { LangSwitcher } from "@/components/client";
import { useI18n } from "@/components/i18n-provider";
import { cx } from "@/components/ui";
import type { PublicKey } from "@/lib/public";
import type { TKey } from "@/lib/i18n";

const VOLT = "#c8f23c";

export type LandingProps = {
  info: Record<PublicKey, string>;
  fee: number; // rupees
  signedIn: { href: string } | null;
};

export function Landing({ info, fee, signedIn, bg }: LandingProps & { bg?: string }) {
  const { t, lang } = useI18n();
  const latin = lang === "en";
  const words = t("publicSite.heroWords").split("|");
  const phone = info.phone.replace(/[^\d+]/g, "");
  const wa = info.whatsapp.replace(/\D/g, "");

  return (
    <ClickSpark sparkColor={[VOLT, "#ffffff"]} sparkCount={10} sparkRadius={28} shape="streak" className="min-h-dvh">
      <div className="dark-surface relative min-h-dvh overflow-x-clip bg-ink-950 text-sand-0 [color-scheme:dark]">
        <Noise opacity={0.035} fixed zIndex={1} blendMode="overlay" />

        {/* ─────────────── nav ─────────────── */}
        <header className="sticky top-0 z-50 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
          <nav aria-label={t("nav.mainNav")} className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
            <Wordmark dark compact />
            <ul className="ml-6 hidden gap-1 lg:flex">
              {(["about", "membership", "trainer", "visit"] as const).map((k) => (
                <li key={k}>
                  <a href={`#${k}`} className="rounded-full px-3.5 py-2 text-[15px] font-medium text-sand-0/70 transition hover:bg-white/5 hover:text-sand-0">
                    {t(`publicSite.nav.${k}`)}
                  </a>
                </li>
              ))}
            </ul>
            <div className="ml-auto flex items-center gap-2">
              <LangSwitcher dark />
              {signedIn ? (
                <Link href={signedIn.href} className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full bg-volt px-4 font-semibold text-ink-950 transition hover:bg-volt-strong">
                  {t("nav.home")} <ArrowRight className="size-4" aria-hidden />
                </Link>
              ) : (
                <>
                  <Link href="/login" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 font-semibold text-sand-0/85 transition hover:bg-white/5 hover:text-white">
                    {t("publicSite.login")}
                  </Link>
                  <Link href="/register" className="hidden min-h-11 items-center whitespace-nowrap rounded-full bg-volt px-4 font-semibold text-ink-950 transition hover:bg-volt-strong md:inline-flex">
                    {t("publicSite.join")}
                  </Link>
                </>
              )}
            </div>
          </nav>
        </header>

        <main id="main">
          {/* ─────────────── hero ─────────────── */}
          <section className="relative isolate flex min-h-[calc(100dvh-4rem)] flex-col overflow-hidden">
            <div aria-hidden className="absolute inset-0 -z-10">
              <HeroBackground variant={bg} />
              {/* Keep the headline side calm so the strands never fight the text. */}
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(18_18_16/0.88)_0%,rgb(18_18_16/0.6)_60%,rgb(18_18_16/0.3)_100%)] lg:bg-[linear-gradient(90deg,rgb(18_18_16/0.75)_0%,rgb(18_18_16/0.35)_45%,transparent_75%)]" />
              <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-ink-950" />
            </div>

            <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-4 pb-16 pt-12 sm:px-6">
              <p className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-sand-0/80 backdrop-blur">
                <MapPin className="size-3.5 text-volt" aria-hidden />
                {t("common.gymTown")}
                {info.since && <span className="text-sand-0/50">· {t("publicSite.since", { year: info.since })}</span>}
              </p>

              <h1 className="font-display font-black uppercase leading-[0.82] tracking-[-0.02em]">
                <SplitText
                  text={t("publicSite.heroTop")}
                  tag="span"
                  textAlign="left"
                  splitType={latin ? "chars" : "words"}
                  effect="rise"
                  trigger="load"
                  delay={45}
                  duration={1}
                  className="block text-[clamp(4.6rem,21vw,13rem)]"
                />
                <span className="mt-2 flex flex-wrap items-center gap-x-[0.18em] text-[clamp(3.2rem,13vw,9.5rem)]">
                  <span>{t("publicSite.heroGet")}</span>
                  <RotatingText
                    texts={words}
                    rotationInterval={2400}
                    staggerDuration={0.018}
                    transition={{ type: "spring", damping: 26, stiffness: 420 }}
                    staggerFrom="last"
                    effect="slide"
                    splitBy={latin ? "characters" : " "}
                    mainClassName="overflow-hidden rounded-[0.12em] bg-volt px-[0.14em] pb-[0.02em] pt-[0.06em] text-ink-950"
                    elementLevelClassName="pb-[0.02em]"
                  />
                </span>
              </h1>

              <p className="mt-7 max-w-xl text-[19px] leading-relaxed text-sand-0/80 sm:text-[21px]">{info.tagline || t("publicSite.heroFallback")}</p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Magnet padding={60} magnetStrength={4} maxOffset={14}>
                  <StarBorder as={Link} href="/register" color={VOLT} radius={18} thickness={1.5} stars={2} backgroundColor="#c8f23c" textColor="#121210" borderColor="rgba(18,18,16,0.25)" className="min-h-14 px-7 text-[18px] font-bold">
                    {t("publicSite.join")}
                    <ArrowRight className="size-5" aria-hidden />
                  </StarBorder>
                </Magnet>
                <Link href="/login" className="inline-flex min-h-14 items-center rounded-[18px] border border-white/15 px-6 text-[17px] font-semibold text-sand-0 transition hover:border-white/40 hover:bg-white/5">
                  {t("publicSite.login")}
                </Link>
                <span className="ml-1 font-display text-[22px] font-bold text-sand-0/80">
                  ₹{fee} <span className="text-[15px] font-sans font-medium text-sand-0/55">{t("publicSite.perMonth")}</span>
                </span>
              </div>
            </div>

            <div className="pointer-events-none absolute bottom-8 right-6 hidden md:block lg:right-12">
              <div className="pointer-events-auto">
                <CircularText text={(latin ? t("publicSite.badge").toUpperCase() : t("publicSite.badge")).replace("₹500", `₹${fee}`)} spinDuration={18} onHover="speedUp" size={170} fontSize={15} fontWeight={700} color="#f3efe6">
                  <span className="grid size-16 place-items-center rounded-full bg-volt text-ink-950">
                    <Dumbbell className="size-8" aria-hidden />
                  </span>
                </CircularText>
              </div>
            </div>

            <a href="#about" className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.2em] text-sand-0/50 transition hover:text-sand-0 sm:flex">
              {t("publicSite.scroll")}
              <ArrowDown className="size-4 motion-safe:animate-bounce" aria-hidden />
            </a>
          </section>

          {/* ─────────────── marquee ─────────────── */}
          <section aria-hidden className="relative -rotate-2 border-y border-white/10 bg-volt py-3 text-ink-950">
            <ScrollVelocity
              texts={[t("publicSite.marqueeA"), t("publicSite.marqueeB")]}
              velocity={60}
              numCopies={6}
              skewWithVelocity={8}
              outlineAlternate
              className="font-display text-[clamp(2.4rem,7vw,5.5rem)] font-black uppercase leading-[1.05]"
            />
          </section>

          {/* ─────────────── about ─────────────── */}
          <section id="about" className="relative mx-auto max-w-6xl scroll-mt-20 px-4 py-28 sm:px-6 sm:py-36">
            <Label>{t("publicSite.aboutLabel")}</Label>
            {info.about ? (
              <ScrollReveal effect="rise" baseOpacity={0.12} blurStrength={6} containerClassName="mt-6" textClassName="font-display text-[clamp(2rem,5.2vw,4.4rem)] font-bold uppercase leading-[1.02] text-sand-0">
                {info.about}
              </ScrollReveal>
            ) : (
              <Placeholder className="mt-6">
                <p className="font-display text-[clamp(1.8rem,4.6vw,3.6rem)] font-bold uppercase leading-[1.04] text-sand-0/45">{t("publicSite.aboutPlaceholder")}</p>
              </Placeholder>
            )}
          </section>

          {/* ─────────────── membership ─────────────── */}
          <section id="membership" className="relative mx-auto max-w-6xl scroll-mt-20 px-4 pb-28 sm:px-6">
            <Label>{t("publicSite.membershipLabel")}</Label>
            <h2 className="mt-4 font-display text-[clamp(2.6rem,7vw,5.5rem)] font-black uppercase leading-[0.9]">{t("publicSite.membershipTitle")}</h2>
            <div className="mt-10 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
              <SpotlightCard spotlightColor="rgba(200, 242, 60, 0.28)" theme="dark" className="rounded-[28px] p-7 sm:p-10">
                <p className="text-[15px] font-semibold uppercase tracking-[0.14em] text-sand-0/60">{t("publicSite.monthly")}</p>
                <p className="mt-3 flex items-start font-display font-black leading-[0.8] text-volt">
                  <span className="mt-[0.12em] text-[clamp(3rem,8vw,5rem)]">₹</span>
                  <CountUp to={fee} from={0} duration={1.6} separator="," mode="roll" className="text-[clamp(7rem,22vw,13rem)] tabular" />
                </p>
                <p className="mt-2 text-[18px] text-sand-0/70">{t("publicSite.perMonth")}</p>
                <Link href="/register" className="mt-8 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-volt text-[18px] font-bold text-ink-950 transition hover:bg-volt-strong active:scale-[0.98] sm:w-auto sm:px-8">
                  {t("publicSite.join")} <ArrowRight className="size-5" aria-hidden />
                </Link>
              </SpotlightCard>
              <div className="grid gap-4">
                <ul className="grid gap-2 rounded-[28px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
                  {(["calendar", "pay", "track", "goals"] as const).map((k) => (
                    <li key={k} className="flex items-center gap-3 py-1.5 text-[17px] text-sand-0/90">
                      <CheckCircle2 className="size-5 shrink-0 text-volt" aria-hidden />
                      {t(`publicSite.perks.${k}`)}
                    </li>
                  ))}
                </ul>
                <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
                  <p className="text-[14px] font-semibold uppercase tracking-[0.14em] text-sand-0/55">{t("publicSite.joining")}</p>
                  {info.joining ? <p className="mt-2 whitespace-pre-line text-[17px] text-sand-0/90">{info.joining}</p> : <Tbc />}
                </div>
              </div>
            </div>
          </section>

          {/* ─────────────── app ─────────────── */}
          <section className="relative overflow-hidden border-y border-white/10 bg-[#161613] py-28">
            <div aria-hidden className="pointer-events-none absolute -left-40 top-20 size-[520px] rounded-full bg-volt/10 blur-[140px]" />
            <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
              <Label>{t("publicSite.appLabel")}</Label>
              <div className="mt-4 grid items-end gap-6 lg:grid-cols-2">
                <h2 className="font-display text-[clamp(2.6rem,7vw,5.5rem)] font-black uppercase leading-[0.9]">{t("publicSite.appTitle")}</h2>
                <p className="max-w-md text-[18px] text-sand-0/70">{t("publicSite.appSub")}</p>
              </div>
              <div className="mt-12 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
                <FeatureColumn keys={["checkin", "goal", "fees"]} />
                <PhoneMock />
                <FeatureColumn keys={["paid", "help", "lang"]} />
              </div>
            </div>
          </section>

          {/* ─────────────── trainer ─────────────── */}
          <section id="trainer" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-28 sm:px-6">
            <Label>{t("publicSite.trainerLabel")}</Label>
            <div className="mt-10 grid items-center gap-10 md:grid-cols-[minmax(0,420px)_1fr]">
              <TiltedCard containerHeight="460px" imageHeight="460px" imageWidth="100%" containerWidth="100%" rotateAmplitude={10} scaleOnHover={1.04} glare={0.35} radius={28} floating>
                <div className="relative flex size-full flex-col justify-between overflow-hidden rounded-[28px] bg-[linear-gradient(160deg,#2a2b22_0%,#121210_60%)] p-6">
                  <div aria-hidden className="absolute -right-16 -top-16 size-72 rounded-full bg-volt/25 blur-3xl" />
                  <span className="relative inline-flex w-fit items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-sand-0/80">
                    <ImageIcon className="size-3.5" aria-hidden />
                    {t("publicSite.photoSoon")}
                  </span>
                  <span className="relative font-display text-[150px] font-black leading-none text-volt/90">BG</span>
                </div>
              </TiltedCard>
              <div>
                <p className="text-[15px] font-semibold uppercase tracking-[0.14em] text-volt">{t("publicSite.trainerRole")}</p>
                <h2 className="mt-2 font-display text-[clamp(3rem,9vw,7rem)] font-black uppercase leading-[0.85]">
                  <DecryptedText text="Bharat Gite" animateOn="view" sequential revealDirection="start" speed={45} className="text-sand-0" encryptedClassName="text-volt/70" />
                </h2>
                {info.trainer ? (
                  <p className="mt-6 max-w-xl whitespace-pre-line text-[19px] leading-relaxed text-sand-0/80">{info.trainer}</p>
                ) : (
                  <Placeholder className="mt-6 max-w-xl">
                    <p className="text-[18px] text-sand-0/55">{t("publicSite.trainerPlaceholder")}</p>
                  </Placeholder>
                )}
              </div>
            </div>
          </section>

          {/* ─────────────── gallery placeholders ─────────────── */}
          <section className="mx-auto max-w-6xl px-4 pb-28 sm:px-6">
            <Label>{t("publicSite.galleryLabel")}</Label>
            <p className="mt-3 text-sand-0/60">{t("publicSite.galleryNote")}</p>
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={cx("group relative grid place-items-center overflow-hidden rounded-[22px] border border-dashed border-white/15 bg-white/[0.03]", i === 0 ? "col-span-2 row-span-2 aspect-square md:aspect-auto" : "aspect-square")}>
                  <div aria-hidden className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_14px,rgba(255,255,255,0.025)_14px_28px)] transition-transform duration-700 group-hover:scale-110" />
                  <span className="relative flex flex-col items-center gap-2 text-center text-[13px] font-semibold uppercase tracking-[0.12em] text-sand-0/45">
                    <ImageIcon className="size-6" aria-hidden />
                    {t("publicSite.photoSoon")}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* ─────────────── visit ─────────────── */}
          <section id="visit" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-28 sm:px-6">
            <Label>{t("publicSite.visitLabel")}</Label>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <InfoCard icon={Clock} title={t("publicSite.timings")}>
                {info.timings ? <p className="whitespace-pre-line text-[18px] text-sand-0/90">{info.timings}</p> : <Tbc />}
              </InfoCard>
              <InfoCard icon={MapPin} title={t("publicSite.address")}>
                {info.address ? <p className="whitespace-pre-line text-[18px] text-sand-0/90">{info.address}</p> : <Tbc />}
                {info.mapUrl && (
                  <a href={info.mapUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-1.5 font-semibold text-volt underline-offset-4 hover:underline">
                    {t("publicSite.openMap")} <ArrowRight className="size-4" aria-hidden />
                  </a>
                )}
              </InfoCard>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ContactButton href={phone ? `tel:${phone}` : null} icon={Phone} label={t("publicSite.callUs")} tbc={t("publicSite.numberTbc")} />
              <ContactButton href={wa ? `https://wa.me/${wa.length === 10 ? `91${wa}` : wa}` : null} icon={MessageCircle} label={t("publicSite.whatsappUs")} tbc={t("publicSite.numberTbc")} wa />
            </div>
          </section>

          {/* ─────────────── final CTA ─────────────── */}
          <section className="relative overflow-hidden border-t border-white/10 px-4 py-28 text-center sm:py-36">
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-volt/15 blur-[160px]" />
            <h2 className="relative font-display text-[clamp(5rem,22vw,16rem)] font-black uppercase leading-[0.8]">
              <ShinyText text={t("publicSite.ready")} color="#f3efe6" shineColor={VOLT} speed={3} />
            </h2>
            <p className="relative mx-auto mt-6 max-w-md text-[18px] text-sand-0/70">{t("publicSite.readySub")}</p>
            <div className="relative mt-9 flex flex-wrap justify-center gap-3">
              <Magnet padding={60} magnetStrength={4} maxOffset={14}>
                <Link href="/register" className="inline-flex min-h-14 items-center gap-2 rounded-[18px] bg-volt px-8 text-[18px] font-bold text-ink-950 transition hover:bg-volt-strong">
                  {t("publicSite.join")} <ArrowRight className="size-5" aria-hidden />
                </Link>
              </Magnet>
              <Link href="/login" className="inline-flex min-h-14 items-center rounded-[18px] border border-white/15 px-7 text-[17px] font-semibold transition hover:border-white/40 hover:bg-white/5">
                {t("publicSite.memberLogin")}
              </Link>
            </div>
          </section>
        </main>

        <footer className="relative border-t border-white/10 px-4 py-8 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
            <Wordmark dark />
            <LangSwitcher dark />
            <p className="w-full text-[13px] text-sand-0/45 sm:w-auto">© {new Date().getFullYear()} {t("publicSite.footer")}</p>
          </div>
        </footer>
      </div>
    </ClickSpark>
  );

  function FeatureColumn({ keys }: { keys: ("checkin" | "goal" | "fees" | "paid" | "help" | "lang")[] }) {
    const icons = { checkin: QrCode, goal: Target, fees: ReceiptText, paid: HandCoins, help: LifeBuoy, lang: Languages };
    return (
      <div className="grid gap-4">
        {keys.map((k) => {
          const Icon = icons[k];
          return (
            <SpotlightCard key={k} spotlightColor="rgba(200, 242, 60, 0.22)" theme="dark" className="rounded-[24px] p-6">
              <span className="grid size-12 place-items-center rounded-[14px] bg-volt text-ink-950">
                <Icon className="size-6" aria-hidden />
              </span>
              <h3 className="mt-4 font-display text-[26px] font-bold uppercase leading-none">{t(`publicSite.features.${k}.title` as TKey)}</h3>
              <p className="mt-2 text-[16px] text-sand-0/65">{t(`publicSite.features.${k}.body` as TKey)}</p>
            </SpotlightCard>
          );
        })}
      </div>
    );
  }

  function PhoneMock() {
    return (
      <div aria-hidden className="mx-auto w-[260px] rounded-[44px] border border-white/15 bg-black p-3 shadow-[0_40px_120px_-30px_rgba(200,242,60,0.35)]">
        <div className="overflow-hidden rounded-[34px] bg-sand-100 text-ink-950">
          <div className="mx-auto mt-2 h-5 w-24 rounded-full bg-black" />
          <div className="px-4 pb-5 pt-4">
            <p className="text-[11px] font-medium text-ink-500">Saturday, 24 October</p>
            <p className="font-display text-[24px] font-extrabold uppercase leading-[0.95]">Welcome back, Krish</p>
            <div className="mt-3 rounded-[20px] bg-ink-950 p-4 text-sand-0">
              <div className="flex items-center gap-3">
                <svg viewBox="0 0 80 80" className="size-[74px] -rotate-90">
                  <circle cx="40" cy="40" r="33" fill="none" strokeWidth="9" className="stroke-white/10" />
                  <circle cx="40" cy="40" r="33" fill="none" strokeWidth="9" strokeLinecap="round" stroke={VOLT} strokeDasharray="207" className="landing-ring" />
                </svg>
                <div>
                  <p className="text-[10px] text-sand-0/70">Monthly goal: 12 visits</p>
                  <p className="font-display text-[18px] font-bold uppercase leading-tight">7 of 12 completed</p>
                </div>
              </div>
              <div className="mt-3 flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-volt text-[13px] font-semibold text-ink-950">
                <CalendarCheck2 className="size-4" /> Check in
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-[16px] bg-white p-3 text-[12px] font-semibold text-ok">
              <CheckCircle2 className="size-4" /> All paid up. Thank you!
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-[16px] bg-white p-3 text-[12px] font-semibold">
              <LifeBuoy className="size-4 text-info" /> Need help with my routine
            </div>
          </div>
        </div>
      </div>
    );
  }
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="font-display text-[18px] font-bold uppercase tracking-[0.08em] text-volt">{children}</p>;
}

/** Clearly marks copy that still needs the owner's confirmation. */
function Placeholder({ children, className }: { children: React.ReactNode; className?: string }) {
  const { t } = useI18n();
  return (
    <div className={cx("relative rounded-[24px] border border-dashed border-volt/40 p-6", className)}>
      <span className="absolute -top-3 left-5 rounded-full bg-volt px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-950">{t("publicSite.placeholder")}</span>
      {children}
    </div>
  );
}

function Tbc() {
  const { t } = useI18n();
  return (
    <p className="mt-1 inline-flex items-center gap-2 rounded-full border border-dashed border-volt/40 px-3 py-1 text-[15px] font-semibold text-volt/90">
      <Clock className="size-4" aria-hidden />
      {t("publicSite.tbc")}
    </p>
  );
}

function InfoCard({ icon: Icon, title, children }: { icon: typeof Clock; title: string; children: React.ReactNode }) {
  return (
    <SpotlightCard spotlightColor="rgba(200, 242, 60, 0.18)" theme="dark" className="rounded-[24px] p-6 sm:p-8">
      <p className="flex items-center gap-2 text-[14px] font-semibold uppercase tracking-[0.14em] text-sand-0/55">
        <Icon className="size-4 text-volt" aria-hidden />
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </SpotlightCard>
  );
}

function ContactButton({ href, icon: Icon, label, tbc, wa }: { href: string | null; icon: typeof Phone; label: string; tbc: string; wa?: boolean }) {
  if (!href)
    return (
      <span className="flex min-h-16 items-center justify-center gap-2 rounded-[20px] border border-dashed border-white/15 text-[16px] font-semibold text-sand-0/45">
        <Icon className="size-5" aria-hidden />
        {label} · {tbc}
      </span>
    );
  return (
    <a
      href={href}
      {...(wa ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cx("flex min-h-16 items-center justify-center gap-2 rounded-[20px] text-[18px] font-bold transition active:scale-[0.98]", wa ? "bg-[#25d366] text-ink-950 hover:brightness-105" : "bg-sand-0 text-ink-950 hover:bg-white")}
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </a>
  );
}
