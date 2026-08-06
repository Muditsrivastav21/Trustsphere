import { useEffect, useState } from "react";

type Props = {
  score: number;
  size?: number;
  stroke?: number;
  animate?: boolean;
  showLabel?: boolean;
  className?: string;
};

// Semantic risk colors — same values as the .chip-* / --color-success/warning/danger
// tokens in styles.css, kept in sync deliberately rather than reading CSS vars at
// runtime (SVG stroke can't consume var() reliably across the animation).
function colorFor(score: number) {
  if (score >= 80) return "#147A52";   // success
  if (score >= 50) return "#8A5A00";   // warning
  return "#B3261E";                     // danger
}
function colorForDark(score: number) {
  if (score >= 80) return "#3FBE82";
  if (score >= 50) return "#E3A63E";
  return "#E5534B";
}

export function TrustRing({ score, size = 180, stroke = 10, animate = true, showLabel = true, className }: Props) {
  const [display, setDisplay] = useState(animate ? 0 : score);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!animate) { setDisplay(score); return; }
    const start = performance.now();
    const from = display;
    const to = score;
    const dur = 500;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 2);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, animate]);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - display / 100);
  const color = (isDark ? colorForDark : colorFor)(display);
  const level = display >= 80 ? "Low risk" : display >= 50 ? "Medium risk" : "High risk";
  const trackColor = isDark ? "#262B33" : "#E3E5EA";

  return (
    <div className={className} style={{ width: size, height: size, position: "relative" }} role="img" aria-label={`Trust score ${display} out of 100, ${level}`}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: animate ? "stroke-dashoffset 160ms linear, stroke 160ms linear" : undefined }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div className="font-mono font-semibold" style={{ fontSize: size * 0.22, color, lineHeight: 1 }}>{display}</div>
        {showLabel && (
          <div className="label-caps mt-1.5" style={{ color: "var(--color-text-dim)", fontSize: 10.5 }}>{level}</div>
        )}
      </div>
    </div>
  );
}

export function MiniTrustRing({ score, size = 26 }: { score: number; size?: number }) {
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const color = colorFor(score);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} role="img" aria-label={`Score ${score}`}>
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--color-border-default)" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={stroke} fill="none"
        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} />
    </svg>
  );
}
