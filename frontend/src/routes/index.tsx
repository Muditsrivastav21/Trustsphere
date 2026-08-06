import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TrustRing } from "@/components/TrustRing";
import { BobLogo } from "@/components/BobLogo";
import { ThemeToggle } from "@/components/Sidebar";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TrustSphere — Identity Trust for Bank of Baroda" },
      { name: "description", content: "Every login carries a risk score. Real-time identity trust and adaptive authentication for Bank of Baroda." },
      { property: "og:title", content: "TrustSphere" },
      { property: "og:description", content: "Real-time identity trust scoring for Bank of Baroda." },
    ],
  }),
  component: Landing,
});

const heroLoop = [
  { score: 92, label: "Trusted device · Lucknow, IN", action: "Access granted", tone: "success" as const },
  { score: 65, label: "New device · OTP verification", action: "OTP requested", tone: "warning" as const },
  { score: 28, label: "Suspicious IP · fraud ring match", action: "Access blocked", tone: "danger" as const },
];

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 bg-[var(--color-page-bg)] transition-shadow duration-150 ${scrolled ? "border-b border-[var(--color-border-default)]" : "border-b border-transparent"}`}>
      <div className="max-w-[1120px] mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/"><BobLogo size={26} /></Link>
        <div className="hidden md:flex items-center gap-7 text-[13.5px] font-medium">
          <a href="#how" className="text-[var(--color-text-sub)] hover:text-[var(--color-text-main)] transition-colors">How it works</a>
          <a href="#scenarios" className="text-[var(--color-text-sub)] hover:text-[var(--color-text-main)] transition-colors">Live scenarios</a>
          <a href="#stats" className="text-[var(--color-text-sub)] hover:text-[var(--color-text-main)] transition-colors">Performance</a>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Link to="/login" className="text-[13.5px] font-medium text-[var(--color-text-sub)] hover:text-[var(--color-text-main)] transition-colors">Sign in</Link>
          <Link to="/dashboard" className="btn-primary h-8 px-3.5 text-[13px]">Open dashboard</Link>
        </div>
      </div>
    </nav>
  );
}

function HeroPanel() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % heroLoop.length), 3200);
    return () => clearInterval(t);
  }, []);
  const cur = heroLoop[idx];

  return (
    <div className="surface-card p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="label-caps text-[var(--color-text-dim)]">Trust score · live</div>
        <div className="flex items-center gap-1.5">
          <span className="status-dot" style={{ background: "var(--color-success)" }} />
          <span className="text-[10.5px] font-mono text-[var(--color-text-dim)] uppercase tracking-wide">Streaming</span>
        </div>
      </div>

      <div className="flex justify-center my-6">
        <TrustRing key={idx} score={cur.score} size={168} />
      </div>

      <div className="space-y-3">
        <span className={`chip chip-${cur.tone}`}>{cur.action}</span>
        <div className="text-[13px] text-[var(--color-text-sub)] bg-[var(--color-surface-sunken)] p-2.5 rounded-md">{cur.label}</div>

        <div className="grid grid-cols-3 gap-1.5 pt-4 border-t border-[var(--color-border-default)]">
          {heroLoop.map((s, i) => (
            <div key={i} className={`text-center py-1.5 rounded text-[10.5px] font-medium transition-colors duration-150 ${i === idx ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-brand)]" : "text-[var(--color-text-dim)]"}`}>
              Scenario {i + 1}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProcessStrip() {
  const steps = ["User attempts login", "Device fingerprint captured", "Behavior analyzed", "Risk score calculated", "Access decision made"];
  return (
    <section id="how" className="max-w-[1120px] mx-auto px-6 py-24">
      <div className="mb-12">
        <div className="label-caps text-[var(--color-accent-brand)] mb-2.5">Pipeline</div>
        <h2 className="text-[26px] font-semibold tracking-tight text-[var(--color-text-main)]">How a login is evaluated</h2>
      </div>

      <ol className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {steps.map((s, i) => (
          <li key={i} className="surface-card surface-card-hover p-5">
            <div className="w-7 h-7 rounded-md bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] flex items-center justify-center font-mono text-[12.5px] font-semibold text-[var(--color-text-sub)] mb-4">
              {i + 1}
            </div>
            <div className="text-[13.5px] font-medium text-[var(--color-text-main)] leading-snug">{s}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ScenarioCards() {
  const cards = [
    { name: "Rahul Sharma", score: 92, tone: "success" as const, outcome: "Access granted in 47ms", note: "Trusted device, consistent typing pattern, known IP." },
    { name: "Priya Verma", score: 65, tone: "warning" as const, outcome: "OTP verification required", note: "New device fingerprint, recognized account, normal behavior." },
    { name: "Unknown · Cust ID 1042", score: 28, tone: "danger" as const, outcome: "Access blocked — fraud ring", note: "IP shared by 6 accounts. Typing anomaly score 0.91." },
  ];
  return (
    <section id="scenarios" className="max-w-[1120px] mx-auto px-6 py-24 border-t border-[var(--color-border-default)]">
      <div className="flex flex-col md:flex-row items-end justify-between mb-10 gap-4">
        <div>
          <div className="label-caps text-[var(--color-accent-brand)] mb-2.5">Live scenarios</div>
          <h2 className="text-[26px] font-semibold tracking-tight text-[var(--color-text-main)]">Three logins. Three outcomes.</h2>
        </div>
        <Link to="/login" className="text-[13.5px] font-medium text-[var(--color-accent-brand)] hover:underline inline-flex items-center gap-1">
          Try the demo <ArrowRight size={14} strokeWidth={2} />
        </Link>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {cards.map((c, i) => (
          <div key={i} className="surface-card p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="label-caps text-[var(--color-text-dim)] mb-1">Customer</div>
                <div className="font-medium text-[15px] text-[var(--color-text-main)]">{c.name}</div>
              </div>
              <div className="font-mono font-semibold text-[15px]" style={{ color: `var(--color-${c.tone})` }}>{c.score}</div>
            </div>
            <span className={`chip chip-${c.tone} mb-3`}>{c.outcome}</span>
            <p className="text-[13px] text-[var(--color-text-sub)] leading-relaxed">{c.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatsBar() {
  const stats = [
    { v: "24,841", l: "Logins analyzed today" },
    { v: "1,203", l: "Threats blocked" },
    { v: "< 80ms", l: "Avg. decision latency" },
  ];
  return (
    <section id="stats" className="max-w-[1120px] mx-auto px-6 py-16 border-t border-[var(--color-border-default)]">
      <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[var(--color-border-default)]">
        {stats.map((s, i) => (
          <div key={i} className="text-center px-6 py-6 md:py-0">
            <div className="font-mono font-semibold text-[32px] text-[var(--color-text-main)] tracking-tight">{s.v}</div>
            <div className="label-caps text-[var(--color-text-dim)] mt-2">{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Landing() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="min-h-screen bg-[var(--color-page-bg)] text-[var(--color-text-main)] flex flex-col">
      <Navbar />

      <section className="pt-32 pb-20">
        <div className="max-w-[1120px] mx-auto px-6 grid lg:grid-cols-[1.15fr_0.85fr] gap-14 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[11px] font-medium text-[var(--color-text-sub)] uppercase tracking-wide mb-6">
              <span className="status-dot" style={{ background: "var(--color-accent-brand)" }} />
              Bank of Baroda · Identity Trust
            </div>

            <h1 className="text-[44px] md:text-[54px] font-semibold tracking-tight text-[var(--color-text-main)] leading-[1.1]">
              Every login carries a risk score. Act on it.
            </h1>
            <p className="text-[16px] text-[var(--color-text-sub)] max-w-[46ch] mt-5 leading-relaxed">
              TrustSphere evaluates device signals, typing patterns, and fraud networks in real time — so Bank of Baroda customers get a secure login without added friction.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Link to="/login" className="btn-primary h-10 px-5">Enter portal</Link>
              <Link to="/dashboard" className="btn-secondary h-10 px-5">Analyst dashboard</Link>
            </div>

            <div className="mt-12 grid grid-cols-3 gap-6 max-w-md border-t border-[var(--color-border-default)] pt-6">
              {[
                { k: "Decision", v: "< 80ms" },
                { k: "Signals", v: "42+" },
                { k: "Model", v: "v3.1" },
              ].map((it) => (
                <div key={it.k}>
                  <div className="font-mono text-[20px] font-semibold text-[var(--color-text-main)]">{it.v}</div>
                  <div className="label-caps text-[var(--color-text-dim)] mt-1">{it.k}</div>
                </div>
              ))}
            </div>
          </div>

          <HeroPanel />
        </div>
      </section>

      <ProcessStrip />
      <ScenarioCards />
      <StatsBar />

      <footer className="border-t border-[var(--color-border-default)] py-8 mt-4">
        <div className="max-w-[1120px] mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <BobLogo size={22} />
          <div className="font-mono text-[11px] text-[var(--color-text-dim)]">
            © 2026 Bank of Baroda · TrustSphere build 3.1.04
          </div>
        </div>
      </footer>
    </div>
  );
}
