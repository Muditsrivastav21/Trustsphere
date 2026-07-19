import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TrustRing } from "@/components/TrustRing";
import { BobLogo } from "@/components/BobLogo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TrustSphere AI — Identity Trust for Bank of Baroda" },
      { name: "description", content: "Every login carries a risk score. Real-time identity trust and adaptive authentication for Bank of Baroda." },
      { property: "og:title", content: "TrustSphere AI" },
      { property: "og:description", content: "Real-time identity trust scoring for Bank of Baroda." },
    ],
  }),
  component: Landing,
});

const heroLoop = [
  { score: 92, label: "Trusted Device · Lucknow, IN", action: "ACCESS GRANTED", tone: "success" as const },
  { score: 65, label: "New Device · OTP Verification", action: "OTP REQUESTED", tone: "warning" as const },
  { score: 28, label: "Suspicious IP · Fraud Ring Match", action: "ACCESS BLOCKED", tone: "danger" as const },
];

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-[#0a111a]/70 backdrop-blur-xl border-b border-white/5 shadow-lg" : "bg-transparent"}`}>
      <div className="max-w-[1280px] mx-auto px-8 h-16 flex items-center justify-between">
        <Link to="/"><BobLogo /></Link>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium">
          <a href="#how" className="text-white/60 hover:text-white transition-colors">How it works</a>
          <a href="#scenarios" className="text-white/60 hover:text-white transition-colors">Live scenarios</a>
          <a href="#stats" className="text-white/60 hover:text-white transition-colors">Performance</a>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/login" className="text-sm font-semibold text-white/70 hover:text-white transition-colors">Login portal</Link>
          <Link to="/dashboard" className="px-5 py-2 rounded-xl bg-gradient-to-r from-[var(--color-bob-orange)] to-[var(--color-bob-orange-deep)] text-white font-bold text-sm shadow-[0_4px_15px_rgba(242,101,34,0.3)] hover:shadow-[0_6px_20px_rgba(242,101,34,0.5)] hover:-translate-y-0.5 transition-all">Open dashboard</Link>
        </div>
      </div>
    </nav>
  );
}

function HeroRing() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % heroLoop.length), 3200);
    return () => clearInterval(t);
  }, []);
  const cur = heroLoop[idx];
  const tone = cur.tone;
  const chip = tone === "success" ? "bg-[rgba(0,196,140,0.1)] border-[var(--color-success)]/30 text-[var(--color-success)]" : tone === "warning" ? "bg-[rgba(245,166,35,0.1)] border-[var(--color-warning)]/30 text-[var(--color-warning)]" : "bg-[rgba(232,56,79,0.1)] border-[var(--color-danger)]/30 text-[var(--color-danger)]";
  
  return (
    <div className="relative group perspective-1000">
      {/* Glow behind card */}
      <div className="absolute inset-0 bg-[var(--color-bob-orange)]/10 rounded-3xl blur-[80px] pointer-events-none group-hover:bg-[var(--color-bob-orange)]/20 transition-all duration-700" />
      
      <div className="bg-[#0a111a]/60 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] rounded-3xl p-8 relative overflow-hidden transition-transform duration-700 group-hover:-translate-y-2">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
        
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div className="label-caps text-white/50 tracking-widest text-[10px]">Trust Score · Live</div>
            <div className="flex items-center gap-2 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse shadow-[0_0_8px_var(--color-success)]" />
              <span className="text-[9px] font-mono tracking-widest text-white/70 uppercase">Streaming</span>
            </div>
          </div>
          
          <div className="flex justify-center my-8 drop-shadow-[0_0_20px_rgba(0,0,0,0.5)]">
            <TrustRing key={idx} score={cur.score} size={220} />
          </div>
          
          <div className="mt-8 space-y-4">
            <div className={`inline-flex items-center px-3 py-1.5 rounded-lg border text-[11px] font-bold tracking-widest uppercase shadow-sm ${chip}`}>
              {cur.action}
            </div>
            <div className="font-medium text-sm text-white/70 bg-black/20 p-3 rounded-xl border border-white/5">{cur.label}</div>
            
            <div className="grid grid-cols-3 gap-2 pt-5 border-t border-white/5">
              {heroLoop.map((s, i) => (
                <div key={i} className={`text-center py-2 rounded-lg text-[10px] font-bold tracking-widest uppercase transition-all duration-500 ${i === idx ? "bg-[var(--color-bob-orange)]/10 text-[var(--color-bob-orange)] border border-[var(--color-bob-orange)]/20 shadow-inner" : "text-white/30 border border-transparent"}`}>
                  Scenario {i + 1}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProcessStrip() {
  const steps = ["User Attempts Login", "Device Fingerprint Captured", "Behavior Analyzed", "Risk Score Calculated", "Access Decision Made"];
  return (
    <section id="how" className="relative max-w-[1280px] mx-auto px-8 py-32">
      {/* Background ambient glow for pipeline */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-[160px] bg-[var(--color-bob-orange)]/5 blur-[100px] pointer-events-none" />

      <div className="text-center mb-20 relative z-10">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--color-bob-orange)]/10 border border-[var(--color-bob-orange)]/20 text-[11px] font-bold tracking-widest text-[var(--color-bob-orange)] uppercase mb-6 shadow-[0_0_15px_rgba(242,101,34,0.15)]">
          <span className="w-2 h-2 rounded-full bg-[var(--color-bob-orange)] animate-pulse shadow-[0_0_8px_var(--color-bob-orange)]" />
          Pipeline
        </div>
        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white drop-shadow-sm">How a login is evaluated</h2>
      </div>

      <div className="relative mt-12 z-10">
        {/* Animated Connector Line Base */}
        <div className="absolute top-[40%] left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-y-1/2 hidden md:block" />
        {/* Animated Connector Line Glow */}
        <div className="absolute top-[40%] left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--color-bob-orange)] to-transparent -translate-y-1/2 hidden md:block blur-[3px] [mask-image:linear-gradient(to_right,transparent,white_50%,transparent)]" style={{ animation: 'shimmer 2.5s infinite linear', backgroundSize: '200% 100%' }} />
        <div className="absolute top-[40%] left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--color-bob-orange)] to-transparent -translate-y-1/2 hidden md:block [mask-image:linear-gradient(to_right,transparent,white_50%,transparent)]" style={{ animation: 'shimmer 2.5s infinite linear', backgroundSize: '200% 100%' }} />

        <div className="relative grid grid-cols-1 md:grid-cols-5 gap-6">
          {steps.map((s, i) => (
            <div key={i} className="bg-gradient-to-b from-white/10 to-transparent backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_8px_20px_rgba(0,0,0,0.5)] rounded-3xl p-8 flex flex-col items-center text-center hover:border-[var(--color-bob-orange)]/40 hover:bg-white/[0.05] hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_10px_40px_rgba(242,101,34,0.2)] transition-all duration-500 hover:-translate-y-3 group animate-fade-in-up" style={{ animationDelay: `${i*0.1}s` }}>
              <div className="w-14 h-14 rounded-full bg-[#0a111a]/80 backdrop-blur-md border border-white/20 group-hover:border-[var(--color-bob-orange)] group-hover:shadow-[0_0_25px_rgba(242,101,34,0.5)] transition-all duration-500 flex items-center justify-center font-mono text-lg font-bold text-white/70 group-hover:text-white mb-6 relative overflow-hidden">
                 <div className="absolute inset-0 bg-[var(--color-bob-orange)]/0 group-hover:bg-[var(--color-bob-orange)]/20 transition-colors duration-500" />
                 <span className="relative z-10">{i+1}</span>
              </div>
              <div className="text-sm font-bold tracking-wide leading-relaxed text-white/90 group-hover:text-white transition-colors">{s}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ScenarioCards() {
  const cards = [
    { name: "Rahul Sharma", score: 92, tone: "success", outcome: "Access granted in 47ms", note: "Trusted device, consistent typing pattern, known IP." },
    { name: "Priya Verma", score: 65, tone: "warning", outcome: "OTP verification required", note: "New device fingerprint, recognized account, normal behavior." },
    { name: "Unknown · Cust ID 1042", score: 28, tone: "danger", outcome: "Access blocked, fraud ring", note: "IP shared by 6 accounts. Typing anomaly score 0.91." },
  ];
  return (
    <section id="scenarios" className="relative max-w-[1280px] mx-auto px-8 py-24">
      {/* Decorative top border */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      
      <div className="flex flex-col md:flex-row items-end justify-between mb-12 gap-6 relative z-10">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-bold tracking-widest text-white/60 uppercase mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-bob-orange)]" />
            Live Scenarios
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white drop-shadow-sm">Three logins. Three outcomes.</h2>
        </div>
        <Link to="/login" className="hidden md:inline-flex px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white/80 font-semibold hover:bg-white/10 hover:text-white transition-all shadow-sm backdrop-blur-sm">Try the demo →</Link>
      </div>
      
      <div className="grid md:grid-cols-3 gap-6 relative z-10">
        {cards.map((c, i) => {
          const glowColors = {
            success: "rgba(0,196,140,0.15)",
            warning: "rgba(245,166,35,0.15)",
            danger: "rgba(232,56,79,0.15)",
          };
          return (
            <div key={i} className="group relative rounded-3xl transition-all duration-500 hover:-translate-y-2 perspective-1000">
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-3xl blur-[50px]" style={{ background: glowColors[c.tone as keyof typeof glowColors] }} />
              
              <div className="relative h-full bg-[#0a111a]/60 backdrop-blur-xl border border-white/10 group-hover:border-white/20 rounded-3xl p-8 flex flex-col shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                
                <div className="flex items-start justify-between relative z-10">
                  <div>
                    <div className="label-caps text-white/40 tracking-widest text-[10px] mb-2">Customer</div>
                    <div className="font-bold text-xl text-white/90">{c.name}</div>
                  </div>
                  <div className="drop-shadow-lg">
                    <TrustRing score={c.score} size={70} stroke={6} showLabel={false} animate={false} />
                  </div>
                </div>
                
                <div className="mt-8 pt-6 border-t border-white/5 flex-1 flex flex-col justify-end relative z-10">
                  <div className={`inline-flex items-center self-start text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border shadow-sm ${
                    c.tone === "success" ? "bg-[rgba(0,196,140,0.1)] border-[var(--color-success)]/30 text-[var(--color-success)]" :
                    c.tone === "warning" ? "bg-[rgba(245,166,35,0.1)] border-[var(--color-warning)]/30 text-[var(--color-warning)]" :
                    "bg-[rgba(232,56,79,0.1)] border-[var(--color-danger)]/30 text-[var(--color-danger)]"
                  }`}>
                    {c.outcome}
                  </div>
                  <p className="text-sm text-white/60 mt-4 leading-relaxed font-medium">{c.note}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-10 text-center md:hidden">
        <Link to="/login" className="inline-flex px-8 py-4 rounded-xl bg-white/5 border border-white/10 text-white font-semibold shadow-sm backdrop-blur-sm">Try the demo →</Link>
      </div>
    </section>
  );
}

function StatsBar() {
  return (
    <section id="stats" className="relative py-12 px-8">
      {/* Decorative top border */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      
      <div className="max-w-[1280px] mx-auto bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-8 md:p-12 shadow-[0_8px_32px_rgba(0,0,0,0.5)] grid md:grid-cols-3 gap-8 md:gap-0 divide-y md:divide-y-0 md:divide-x divide-white/10 relative overflow-hidden">
        {/* Subtle inner glow */}
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-bob-orange)]/5 via-transparent to-[var(--color-bob-orange)]/5 pointer-events-none" />
        
        {[
          { v: "24,841", l: "Logins analyzed today" },
          { v: "1,203", l: "Threats blocked" },
          { v: "< 80ms", l: "Avg decision latency" },
        ].map((s, i) => (
          <div key={i} className="text-center px-6 py-6 md:py-2 animate-fade-in-up relative z-10" style={{ animationDelay: `${i*0.1}s` }}>
            <div className="font-mono font-extrabold text-5xl md:text-6xl text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60 tracking-tight drop-shadow-md">{s.v}</div>
            <div className="text-[var(--color-bob-orange)] tracking-[0.2em] mt-5 text-[11px] font-bold uppercase">{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Landing() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a111a] text-white flex flex-col relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)] pointer-events-none" />
      <div className="absolute top-[-10%] left-[-10%] w-[800px] h-[800px] bg-[var(--color-bob-orange)]/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[800px] h-[800px] bg-blue-600/5 rounded-full blur-[150px] pointer-events-none" />
      
      <Navbar />

      {/* HERO */}
      <section className="relative pt-40 pb-24 overflow-hidden z-10">
        <div className="relative max-w-[1280px] mx-auto px-8 grid lg:grid-cols-[1.1fr_0.9fr] gap-16 items-center">
          <div className="animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold tracking-widest text-white/70 uppercase shadow-sm mb-8 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-[var(--color-bob-orange)] animate-pulse shadow-[0_0_8px_rgba(242,101,34,0.8)]" />
              Bank of Baroda · Identity Trust
            </div>
            
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] drop-shadow-md max-w-2xl">
              Every login carries a <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-bob-orange)] to-yellow-500">risk score.</span><br/>
              Act on it.
            </h1>
            
            <p className="mt-8 text-lg md:text-xl text-white/60 max-w-xl leading-relaxed font-medium">
              TrustSphere watches device signals, typing patterns, and fraud networks in real time, so Bank of Baroda's customers never have to think about security.
            </p>
            
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link to="/login" className="px-8 py-4 rounded-xl bg-gradient-to-r from-[var(--color-bob-orange)] to-[var(--color-bob-orange-deep)] text-white font-bold text-center shadow-[0_4px_20px_rgba(242,101,34,0.4)] hover:shadow-[0_6px_25px_rgba(242,101,34,0.6)] hover:-translate-y-1 transition-all tracking-wide text-lg">Enter portal →</Link>
              <Link to="/dashboard" className="px-8 py-4 rounded-xl bg-white/5 border border-white/10 text-white font-bold text-center hover:bg-white/10 transition-all shadow-sm backdrop-blur-sm tracking-wide text-lg">Analyst dashboard</Link>
            </div>
            
            <div className="mt-14 grid grid-cols-3 gap-6 max-w-md border-t border-white/10 pt-8">
              {[
                { k: "Decision", v: "< 80ms" },
                { k: "Signals", v: "42+" },
                { k: "Models", v: "v3.1" },
              ].map((it) => (
                <div key={it.k}>
                  <div className="font-mono text-2xl font-bold text-white drop-shadow-sm">{it.v}</div>
                  <div className="text-[10px] font-bold tracking-widest text-white/40 uppercase mt-2">{it.k}</div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="animate-fade-in-up" style={{ animationDelay: "200ms" }}>
            <HeroRing />
          </div>
        </div>
      </section>

      <div className="z-10">
        <ProcessStrip />
        <ScenarioCards />
        <StatsBar />
      </div>

      {/* FOOTER */}
      <footer className="border-t border-white/5 py-12 mt-10 relative z-10 bg-[#0a111a]/80 backdrop-blur-md">
        <div className="max-w-[1280px] mx-auto px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 opacity-70 hover:opacity-100 transition-opacity">
            <BobLogo size={26} />
          </div>
          <div className="font-mono text-[11px] text-white/40 tracking-widest uppercase">
            © 2026 Bank of Baroda · TrustSphere build 3.1.04
          </div>
        </div>
      </footer>
    </div>
  );
}

