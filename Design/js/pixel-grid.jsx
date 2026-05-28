/* global React */
// PixelGrid — animated 8px-cell canvas. violet/blue scattered with a slow diagonal wave.
const { useEffect, useRef } = React;

function PixelGrid({ density = 0.18, violetRatio = 0.6, opacity = 1, waveColor = "violet", className = "" }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const CELL = 8, GAP = 1;
    let cells = [];
    let t0 = performance.now();

    function resize() {
      const rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // seed cells deterministically per resize
      cells = [];
      const cols = Math.ceil(W / (CELL + GAP));
      const rows = Math.ceil(H / (CELL + GAP));
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (Math.random() < density) {
            cells.push({
              x, y,
              base: 0.18 + Math.random() * 0.55,
              hue: Math.random() < violetRatio ? "violet" : "blue",
              phase: Math.random() * Math.PI * 2,
              speed: 0.4 + Math.random() * 0.8,
            });
          }
        }
      }
    }

    function draw(now) {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      // base hairline cells (very faint structural noise)
      // wave: diagonal sweep
      const waveSpeed = 0.18;
      const wavePos = ((t * waveSpeed) % 1.6) - 0.3; // -0.3..1.3 of diagonal
      const diag = W + H;

      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const px = c.x * (CELL + GAP);
        const py = c.y * (CELL + GAP);
        // distance along diagonal in [0..1]
        const dn = (px + py) / diag;
        const waveDelta = Math.max(0, 0.22 - Math.abs(dn - wavePos)); // peak ~0.22
        const flicker = 0.5 + 0.5 * Math.sin(t * c.speed * 2 + c.phase);
        const intensity = Math.min(1, c.base * (0.5 + flicker * 0.5) + waveDelta * 2.4);
        const isViolet = c.hue === "violet";
        const r = isViolet ? 167 : 79;
        const g = isViolet ? 139 : 139;
        const b = isViolet ? 250 : 255;
        ctx.fillStyle = `rgba(${r},${g},${b},${intensity * opacity})`;
        ctx.fillRect(px, py, CELL, CELL);
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    resize();
    rafRef.current = requestAnimationFrame(draw);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [density, violetRatio, opacity, waveColor]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
        pointerEvents: "none",
      }}
    />
  );
}

window.PixelGrid = PixelGrid;
