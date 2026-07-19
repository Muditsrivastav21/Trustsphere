export function BobLogo({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="8" fill="#F26522"/>
        <path d="M9 9 L16 6 L23 9 L23 17 C23 21 19.5 24.5 16 26 C12.5 24.5 9 21 9 17 Z" fill="#fff"/>
        <path d="M13.5 16 L15.5 18 L19 14" stroke="#F26522" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
      <div className="leading-tight">
        <div className="font-bold text-[15px] tracking-tight">TrustSphere</div>
        <div className="text-[9px] label-caps text-[var(--color-text-muted)]">Bank of Baroda</div>
      </div>
    </div>
  );
}
