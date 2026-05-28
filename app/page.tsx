import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { SwarmGraph } from "@/components/SwarmGraph";
import { Capabilities } from "@/components/Capabilities";
import { CostStrip } from "@/components/CostStrip";
import { Dossier } from "@/components/Dossier";
import { Footer } from "@/components/Footer";

export default function Page() {
  return (
    <>
      <Nav />
      <Hero />
      <section className="section" id="console">
        <div className="container-x" style={{ textAlign: "center" }}>
          <div className="section-eyebrow" style={{ justifyContent: "center" }}>
            <span className="bar" /> 02 · open the chat
          </div>
          <h2 className="section-heading" style={{ justifyContent: "center" }}>
            <span className="prompt">&gt;</span> talk to the swarm
          </h2>
          <p style={{ color: "var(--ink-secondary)", maxWidth: 640, margin: "20px auto 32px", lineHeight: 1.6 }}>
            the investigation runs as a conversation — type intent, the swarm fans out across Somnia,
            stream of receipts builds the dossier in real time.
          </p>
          <Link href="/chat" className="btn" style={{ padding: "18px 30px", fontSize: 16 }}>
            <span>&gt;</span> open chat
          </Link>
        </div>
      </section>
      <SwarmGraph />
      <Capabilities />
      <CostStrip />
      <Dossier />
      <Footer />
    </>
  );
}
