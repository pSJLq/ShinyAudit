import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "./providers";

// NOTE: do NOT declare `icons` here — Next.js auto-generates them from
// app/icon.svg + app/apple-icon.svg (file-based metadata). Declaring both
// causes a 500 because Next tries to resolve a non-existent `/icon.svg`
// route while the file-based one lives at /icon (no .svg suffix in URL).
export const metadata: Metadata = {
  title: "{s}hinyAudit · agentic on-chain investigator",
  description:
    "A swarm of on-chain agents that reads the Somnia ledger for you — forensic depth, autonomous, verifiable. Built on Somnia's Agentic L1.",
  keywords: ["somnia", "agentic l1", "blockchain investigator", "on-chain forensics", "agentathon"],
  openGraph: {
    title: "{s}hinyAudit · agentic on-chain investigator",
    description: "A swarm. A ledger. A verdict. Built on Somnia.",
    type: "website",
    images: [{ url: "/logo.svg", width: 512, height: 512, alt: "ShinyAudit" }]
  },
  twitter: {
    card: "summary",
    title: "{s}hinyAudit · agentic on-chain investigator",
    description: "A swarm. A ledger. A verdict. Built on Somnia.",
    images: ["/logo.svg"]
  }
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistMono.variable}>
      <body>
        <Providers>{children}</Providers>
        <div className="scanlines" aria-hidden />
        <div className="vignette" aria-hidden />
      </body>
    </html>
  );
}
