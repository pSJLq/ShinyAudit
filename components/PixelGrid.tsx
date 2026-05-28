"use client";

import { useEffect, useRef } from "react";

interface Props {
  /** fraction of cells to seed (0..1). HIGH-2 fix: hero defaults to 0.11. */
  density?: number;
  /** fraction of seeded cells that are violet vs blue */
  violetRatio?: number;
  /** global multiplier on cell alpha */
  opacity?: number;
  className?: string;
}

export function PixelGrid({ density = 0.11, violetRatio = 0.6, opacity = 1, className = "" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const CELL = 8, GAP = 1;
    type Cell = { x: number; y: number; base: number; hue: "violet" | "blue"; phase: number; speed: number };
    let cells: Cell[] = [];
    const t0 = performance.now();

    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
              speed: 0.4 + Math.random() * 0.8
            });
          }
        }
      }
    }

    function draw(now: number) {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      const waveSpeed = 0.18;
      const wavePos = ((t * waveSpeed) % 1.6) - 0.3;
      const diag = W + H;

      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const px = c.x * (CELL + GAP);
        const py = c.y * (CELL + GAP);
        const dn = (px + py) / diag;
        const waveDelta = Math.max(0, 0.22 - Math.abs(dn - wavePos));
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
  }, [density, violetRatio, opacity]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none" }}
    />
  );
}
