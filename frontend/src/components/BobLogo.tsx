export function BobLogo({ size = 36 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <img src="/bob-logo.png" alt="Bank of Baroda" style={{ height: size }} className="object-contain" />
      <div className="leading-tight ml-2 border-l border-[var(--color-glass-border)] pl-2">
        <div className="font-bold tracking-tight text-[var(--color-bob-orange)]" style={{ fontSize: size * 0.45 }}>TrustSphere</div>
        <div className="label-caps text-[var(--color-text-muted)]" style={{ fontSize: size * 0.25 }}>AI Guard</div>
      </div>
    </div>
  );
}
