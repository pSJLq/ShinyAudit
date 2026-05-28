/* tweaks.jsx — visual controls panel for {s}hinyAudit */

const { useEffect: useTwEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "purple",
  "scanlines": 1,
  "pixelGrid": true,
  "animBg": true,
  "density": "regular",
  "view": "user"
}/*EDITMODE-END*/;

const ACCENT_OPTIONS = [
  ["#5601bf", "purple"],
  ["#6e6eed", "blue"],
  ["#00a35e", "lime"],
  ["#d49a00", "amber"],
];

function ShinyTweaks() {
  const [t, setTweak] = window.useTweaks ? window.useTweaks(TWEAK_DEFAULTS) : [TWEAK_DEFAULTS, () => {}];

  // apply
  useTwEffect(() => {
    const accentMap = {
      purple: { p: "#5601bf", g: "rgba(86,1,191,0.45)" },
      blue:   { p: "#6e6eed", g: "rgba(110,110,237,0.45)" },
      lime:   { p: "#00a35e", g: "rgba(0,163,94,0.45)" },
      amber:  { p: "#d49a00", g: "rgba(212,154,0,0.45)" },
    };
    const a = accentMap[t.accent] || accentMap.purple;
    document.documentElement.style.setProperty("--purple", a.p);
    document.documentElement.style.setProperty("--purple-glow", a.g);

    // scanlines
    const s = t.scanlines == null ? 1 : t.scanlines;
    const opacity = s === 0 ? 0 : 0.008 + s * 0.012;
    document.body.style.setProperty("--scan-op", opacity.toFixed(4));
    document.body.classList.toggle("no-grid", !t.pixelGrid);
    document.body.classList.toggle("no-anim-bg", !t.animBg);
    document.body.dataset.density = t.density || "regular";
  }, [t]);

  if (!window.TweaksPanel) return null;
  const { TweaksPanel, TweakSection, TweakRadio, TweakSlider, TweakToggle, TweakColor } = window;

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="// accent">
        <TweakColor
          label="accent color"
          value={t.accent === "purple" ? "#5601bf" : t.accent === "blue" ? "#6e6eed" : t.accent === "lime" ? "#00a35e" : "#d49a00"}
          options={["#5601bf", "#6e6eed", "#00a35e", "#d49a00"]}
          onChange={(v) => {
            const name = v === "#5601bf" ? "purple" : v === "#6e6eed" ? "blue" : v === "#00a35e" ? "lime" : "amber";
            setTweak("accent", name);
          }}
        />
      </TweakSection>

      <TweakSection label="// texture">
        <TweakSlider label="scanline density" min={0} max={3} step={1} value={t.scanlines} onChange={(v) => setTweak("scanlines", v)} />
        <TweakToggle label="pixel grid" value={t.pixelGrid} onChange={(v) => setTweak("pixelGrid", v)} />
        <TweakToggle label="animated bg" value={t.animBg} onChange={(v) => setTweak("animBg", v)} />
      </TweakSection>

      <TweakSection label="// layout">
        <TweakRadio
          label="density"
          value={t.density}
          options={["cosy", "regular", "dense"]}
          onChange={(v) => setTweak("density", v)}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

window.ShinyTweaks = ShinyTweaks;
