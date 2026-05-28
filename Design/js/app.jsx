/* global React, ReactDOM, Nav, Hero, ConsoleSection, SwarmGraph, Capabilities, CostStrip, Dossier, Footer */
const { useState, useEffect } = React;

function App() {
  // konami code → swap violet to lime
  useEffect(() => {
    const seq = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];
    let idx = 0;
    const onKey = (e) => {
      const k = e.key;
      if (k.toLowerCase() === seq[idx].toLowerCase() || k === seq[idx]) {
        idx++;
        if (idx === seq.length) {
          document.documentElement.style.setProperty("--violet", "#B4FF39");
          document.documentElement.style.setProperty("--violet-2", "#7BAA20");
          document.documentElement.style.setProperty("--violet-glow", "rgba(180,255,57,0.45)");
          document.documentElement.style.setProperty("--border-violet-soft", "rgba(180,255,57,0.32)");
          idx = 0;
        }
      } else {
        idx = 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // idle silhouette easter egg — when idle 30s, briefly flash a subtle violet vignette
  useEffect(() => {
    let timer;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        document.body.classList.add("idle");
        setTimeout(() => document.body.classList.remove("idle"), 3500);
      }, 30000);
    };
    arm();
    const evts = ["mousemove","keydown","scroll","click"];
    evts.forEach(e => window.addEventListener(e, arm, { passive: true }));
    return () => { clearTimeout(timer); evts.forEach(e => window.removeEventListener(e, arm)); };
  }, []);

  return (
    <>
      <Nav />
      <Hero />
      <ConsoleSection />
      <SwarmGraph />
      <Capabilities />
      <CostStrip />
      <Dossier />
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
