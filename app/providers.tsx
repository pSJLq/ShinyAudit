"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { wagmiConfig } from "@/lib/somnia/wagmi";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient());

  // konami → swap violet to lime (easter egg)
  useEffect(() => {
    const seq = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
    let idx = 0;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k.toLowerCase() === seq[idx].toLowerCase() || k === seq[idx]) {
        idx++;
        if (idx === seq.length) {
          const root = document.documentElement.style;
          root.setProperty("--violet", "#B4FF39");
          root.setProperty("--violet-2", "#7BAA20");
          root.setProperty("--violet-glow", "rgba(180,255,57,0.45)");
          root.setProperty("--border-violet-soft", "rgba(180,255,57,0.32)");
          idx = 0;
        }
      } else {
        idx = 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // idle 30s → silhouette pulse
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        document.body.classList.add("idle");
        setTimeout(() => document.body.classList.remove("idle"), 3500);
      }, 30000);
    };
    arm();
    const evts: Array<keyof WindowEventMap> = ["mousemove", "keydown", "scroll", "click"];
    evts.forEach((e) => window.addEventListener(e, arm, { passive: true } as AddEventListenerOptions));
    return () => {
      clearTimeout(timer);
      evts.forEach((e) => window.removeEventListener(e, arm));
    };
  }, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
