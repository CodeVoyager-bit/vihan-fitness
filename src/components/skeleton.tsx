/** Shown by loading.tsx while a screen streams in on a slow connection. */
export function ScreenSkeleton({ hero = true, rows = 4 }: { hero?: boolean; rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-fade">
      <span className="sr-only">Loading…</span>
      <div className="mb-5 space-y-2">
        <div className="h-4 w-32 animate-pulse rounded-full bg-sand-200" />
        <div className="h-9 w-56 animate-pulse rounded-xl bg-sand-200" />
      </div>
      {hero && <div className="mb-3 h-44 animate-pulse rounded-[var(--radius-2xl)] bg-ink-900/90" />}
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-[var(--radius-xl)] bg-sand-200/80" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    </div>
  );
}
