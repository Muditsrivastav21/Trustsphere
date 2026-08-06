export function BobLogo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img src="/bob-logo.png" alt="Bank of Baroda" style={{ height: size }} className="object-contain" />
      <div className="leading-tight ml-1 pl-2.5 border-l border-[var(--color-border-default)]">
        <div className="font-semibold tracking-tight text-[var(--color-text-main)]" style={{ fontSize: size * 0.42 }}>
          TrustSphere
        </div>
        <div className="label-caps text-[var(--color-text-dim)]" style={{ fontSize: size * 0.24, letterSpacing: "0.08em" }}>
          Identity Trust
        </div>
      </div>
    </div>
  );
}
