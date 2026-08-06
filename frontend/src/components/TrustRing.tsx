import { useEffect, useState } from "react";

type Props = {
  score: number;
  size?: number;
  stroke?: number;
  animate?: boolean;
  showLabel?: boolean;
  className?: string;
};

function colorFor(score: number) {
  // Interpolate red -> amber -> green
  if (score <= 60) {
    // red -> amber over 0..60
    const t = score / 60;
    return lerpColor("#E8384F", "#F5A623", t);
  } else {
    const t = (score - 60) / 40;
    return lerpColor("#F5A623", "#00C48C", Math.min(1, t));
  }
}

function lerpColor(a: string, b: string, t: number) {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 255, ag = (ah >> 8) & 255, ab = ah & 255;
  const br = (bh >> 16) & 255, bg = (bh >> 8) & 255, bb = bh & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const b2 = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${b2})`;
}

export function TrustRing({ score, size = 200, stroke = 16, animate = true, showLabel = true, className }: Props) {
  const [display, setDisplay] = useState(animate ? 0 : score);

  useEffect(() => {
    if (!animate) { setDisplay(score); return; }
    const start = performance.now();
    const from = display;
    const to = score;
    const dur = 1200;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
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
  const color = colorFor(display);
  const level = display >= 80 ? "LOW RISK" : display >= 50 ? "MEDIUM" : "HIGH RISK";

  return (
    <div className={className} style={{ width: size, height: size, position: "relative" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={radius} stroke="#1E3248" strokeWidth={stroke} fill="none" />
        <circle
          cx={size/2} cy={size/2} r={radius}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: animate ? "stroke-dashoffset 200ms linear, stroke 200ms linear" : undefined,
                   filter: `drop-shadow(0 0 8px ${color}55)` }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div className="font-mono font-bold" style={{ fontSize: size * 0.24, color, lineHeight: 1 }}>{display}</div>
        {showLabel && (
          <div className="label-caps mt-1" style={{ color: "#8FA3B4", fontSize: 10 }}>{level}</div>
        )}
      </div>
    </div>
  );
}

export function MiniTrustRing({ score, size = 28 }: { score: number; size?: number }) {
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const color = colorFor(score);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={radius} stroke="#1E3248" strokeWidth={stroke} fill="none" />
      <circle cx={size/2} cy={size/2} r={radius} stroke={color} strokeWidth={stroke} fill="none"
        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} />
    </svg>
  );
}
