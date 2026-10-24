"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Accent } from "@/lib/site-config";

// WebGL only on the client, after first paint.
const FloatingLines = dynamic(() => import("@/components/bits/FloatingLines"), { ssr: false });
const PixelBlast = dynamic(() => import("@/components/bits/PixelBlast"), { ssr: false });
const LiquidChrome = dynamic(() => import("@/components/bits/LiquidChrome"), { ssr: false });
const GradientBlinds = dynamic(() => import("@/components/bits/GradientBlinds"), { ssr: false });
const Silk = dynamic(() => import("@/components/bits/Silk"), { ssr: false });

// Colours come from the accent preset (Admin → More → Brand); WebGL needs real colours, not CSS variables.
function Variant({ name, accent }: { name: string; accent: Accent }) {
  const VOLT = accent.volt;
  switch (name) {
    case "pixel":
      return <PixelBlast variant="square" pixelSize={4} color={VOLT} patternScale={2.5} patternDensity={1.1} speed={0.45} edgeFade={0.35} glow={0.5} twinkle={0.3} drift={0.25} enableRipples dpr={1.5} />;
    case "chrome":
      return <LiquidChrome color="#d8dccd" speed={0.18} amplitude={0.28} frequencyX={2.6} frequencyY={2.4} roughness={0.35} exposure={0.85} maxDevicePixelRatio={1.5} />;
    case "lines":
      return (
        <FloatingLines linesGradient={[VOLT, "#f3efe6", VOLT]} lineCount={[7, 11, 7]} lineDistance={[7, 5, 7]} animationSpeed={0.7} glow={1.1} brightness={1} parallax parallaxStrength={0.15} mixBlendMode="normal" dpr={1.5} />
      );
    case "silk":
      return <Silk color={accent.night} sheenColor={VOLT} speed={3.5} scale={1.1} noiseIntensity={1.2} sheen={0.6} glow={0.35} rotation={-0.3} dpr={1.5} />;
    default:
      // Lime light through glossy blinds, kept to the right so the headline side stays dark.
      return <GradientBlinds gradientColors={["#121210", accent.deep, VOLT]} angle={20} blindCount={14} noise={0.25} spotlightRadius={0.55} shine={0.45} mixBlendMode="normal" dpr={1.5} />;
  }
}

/**
 * Animated hero backdrop (`variant` is chosen in Admin → More → Brand; default Gradient Blinds). If the GPU drops the WebGL context (older phones, power saving), the canvas
 * is removed and the plain dark base shows instead of a blank white frame.
 */
export function HeroBackground({ variant = "", accent }: { variant?: string; accent: Accent }) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className="absolute inset-0"
      ref={(el) => {
        if (!el) return;
        const onLost = () => setFailed(true);
        el.addEventListener("webglcontextlost", onLost, { capture: true });
        return () => el.removeEventListener("webglcontextlost", onLost, { capture: true });
      }}
    >
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_70%_at_85%_20%,color-mix(in_srgb,var(--color-volt)_10%,transparent),transparent_70%)]" />
      {!failed && <Variant name={variant} accent={accent} />}
    </div>
  );
}
