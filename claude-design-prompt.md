# PROJECT: {s}hinyAudit — Agentic On-Chain Investigator for Somnia

Build the single most visually striking, interactive landing + product page
for an agentic blockchain investigator built on Somnia's Agentic L1.

The brief is uncompromising: nothing on the internet should look more
beautifully engineered than this page. Treat every section as a portfolio
piece. Every interaction must feel intentional, tactile, and "alive."

All data in this prototype is **mocked** — render convincing fake
telemetry, fake addresses, fake receipts, a fake worked-example dossier.
We will swap in the real Somnia integration after the design is approved.

---

## 1. PRODUCT CONCEPT (so you design with intent)

{s}hinyAudit lets anyone interrogate the Somnia blockchain in natural
language. Users connect a wallet, type a prompt like:

  "Trace where the funds from the XYZ airdrop ended up."
  "What is project ABC silently building on-chain before launch?"
  "Audit contract 0xabc... for rug-vectors, hidden mints, owner privileges."
  "Profile this wallet 0xdef... — counterparties, risk, behavior."

A swarm of Somnia agents fans out: a Scout pulls explorer data, a Contract
Auditor reads bytecode + source, a Money-Flow Tracer follows the graph, an
LLM Synthesizer composes a forensic report. The user sees the swarm working
live, then receives a structured investigation.

Billing = sum of agent costs + 50 % service fee, shown transparently before
the user confirms.

---

## 2. BRAND SYSTEM (do not deviate)

### Palette (Somnia-native, dark monochrome + dual neon)
- bg/black        #000000
- bg/raised       #07070A
- bg/elevated     #0E0E14
- border/subtle   #1A1A24
- border/active   #2E2A4A
- ink/primary     #FFFFFF
- ink/secondary   #8A8A99
- ink/muted       #4A4A57
- **accent/violet   #A78BFA**   ← PRIMARY action color (CTAs, focus, brand mark, "user intent")
- accent/violet-2 #7C3AED
- **accent/blue     #4F8BFF**   ← SECONDARY info color (telemetry, logs, agent status, data flows)
- accent/blue-2   #2F6FE3
- signal/lime     #B4FF39   ← terminal "ok" / "done"
- signal/amber    #FFB020   ← caution / medium severity
- signal/red      #FF4D4D   ← rug / exploit / high severity

**Color split rule (strict, enforce everywhere):**
- Violet = anything the *user* drives or owns — buttons, the intent input,
  the brand mark `{s}`, the dispatch CTA, focus rings, primary headlines,
  the "your prompt" node in the swarm graph.
- Blue = anything the *system* emits — agent status pills, telemetry log
  lines, network/data-flow edges, cost ledger numbers, receipt panels,
  ticker readouts, the secondary diagram strokes.
- Never gradient violet→blue together. They live side-by-side, not merged.

### Typography
- Display + UI: "Geist Mono" (fallback: "JetBrains Mono", "IBM Plex Mono")
- All caps for section labels, regular case for content
- Tabular numerals everywhere
- No serif. No "humanist sans." Mono everywhere.

### Iconography & motifs
- Brand mark: `{s}` in square brackets, mono, same baseline as text.
  This product's mark is `{s}` followed by the wordmark `hinyAudit` —
  `{s}` is always accent/violet, the rest is ink/primary.
- Terminal prompt symbol `>` precedes most headings and inputs.
- Square pixel-grid backgrounds (8 px cells) — purple/blue scattered cells
  with a slow noise animation; never rounded.
- Hairline 1 px borders (#1A1A24) frame every panel.
- Corner brackets `⌐ ¬ ⌐ ¬` mark "focus zones" on key panels (4 corners).
- NEVER use border-radius greater than 2 px. Everything is square.

### Voice
- Terse, technical, confident, calm. Lowercase by default.
- Example: "select target. type intent. dispatch the swarm."

---

## 3. PAGE ARCHITECTURE  (single-page, scrollable)

Render the following sections, in this order, inside one continuous page:

1.  Top Nav  (sticky, glass-blur)
2.  Hero  (full viewport, animated, **cinematic — no input here**)
3.  Live Console  (the actual product UI, embedded — this is where the
    intent input lives)
4.  Agent Swarm Diagram  (animated, explains how it works)
5.  Capabilities Grid  (what users can ask)
6.  Cost & Receipts strip
7.  Sample Investigation  (a worked example, scrollable)
8.  Built on Somnia footer

Below: detailed spec of every section.

---

## 4. TOP NAV  (h: 56 px, sticky, bg w/ backdrop-blur 16 px + 70 % opacity)

Left:   `[{s}] hinyAudit`   — `{s}` in accent/violet, rest in ink/primary.
Center: nav links — `> console`  `> swarm`  `> docs`  `> receipts`
Right:  `[ connect wallet ]`  — bordered button, hover = accent/violet glow.
        Once connected: replace with monospace `0xab…cd  •  12.4 STT`
        and an **accent/blue** 8-px pulsing dot indicator (system signal).

A 1 px hairline gradient (violet→transparent) sits beneath the nav.

---

## 5. HERO  (full viewport — cinematic, no input)

### Background
A full-bleed animated **pixel grid**. Base = 8 px black cells with 1 px gap.
Sparse cells light up in accent/violet (60 %) and accent/blue (40 %) with
varying opacity. A slow "wave" sweeps diagonally every 6 s, cascading
illuminations across the grid. Behind the grid, a faint radial glow
(violet, 600 px, 8 % opacity) drifts.

Overlay a subtle scanline CRT texture (1 px horizontal lines, 4 % opacity).

### Foreground
Centered, generous whitespace. Vertical rhythm:

  Pre-title chip (blue-bordered, system-emitted feel):
    `[ s ] · agentic L1 · live on somnia mainnet`
    bordered accent/blue at 30 % opacity, mono, ink/secondary, 12 px,
    padded 6×12.

  Headline (huge, mono, 96–128 px, line-height 1.02, ink/primary):
    `> investigate`
    `  any wallet,`
    `  any contract,`
    `  any flow.`
    The `>` is **accent/violet**. The headline types in on load (each
    line cascades at ~30 cps), violet cursor blinks at end.

  Sub-headline (mono, 18 px, ink/secondary, max-width 640 px):
    "a swarm of on-chain agents reads the somnia ledger for you —
     forensic depth, autonomous, verifiable."

  CTA row:
    [ > dispatch a swarm ]    PRIMARY: violet border + violet text,
                              hover fills violet, text becomes black;
                              subtle pixel-glitch on hover. Scrolls
                              smoothly to the Live Console section.
    [ read the dossier ]      GHOST: only border-bottom in ink/secondary,
                              hover = violet underline, opens docs.

  Below CTAs, a live ticker (mono, 12 px, ink/muted, numbers in
  **accent/blue**):
    `live · 2,418 investigations · 19,047 contracts profiled · 84,200 STT spent`
    Numbers tick up every few seconds with a single-digit slot-machine roll.

### Right-side ambient panel (desktop only, absolute-positioned)
A floating 280 × 360 panel labeled `> swarm.status` showing four agents
breathing softly (a 4-row mini console with rolling log lines).
- Status dots in **accent/blue** (system telemetry).
- Log text in ink/secondary, mono 11 px.

  `scout-01      ● online   chain 5031`
  `auditor-03    ● online   q: 12`
  `tracer-07     ● online   q: 4`
  `synth-02      ● online   q: 1`

Below: a scrolling activity feed with fake recent events
(`tx 0x9af… scanned`, `contract 0xabc… decoded`, `flow → 0xdef… mapped`).

---

## 6. LIVE CONSOLE  (the actual product, embedded — this is the centerpiece)

Section heading:
  `> console`         huge, mono, 64 px, ink/primary, with corner-bracket frame.

Layout: a single dark panel, 1180 px max-width, 700 px tall, padded 32 px,
bordered 1 px border/subtle with a faint **violet** inner glow on focus
(user-owned region).

Internal structure — three regions stacked:

### 6a. INTENT INPUT (top, ~ 30 % height) — VIOLET zone
A giant textarea with monospace placeholder:
  `> describe what you want the swarm to uncover…
   e.g. "follow funds from 0xairdrop… and flag any mixer interaction"`

- 22 px font, generous line-height, ink/primary text
- Blinking **violet** caret
- Textarea border becomes accent/violet on focus
- Below the textarea, a row of "quick-intent chips" (clickable
  pre-fills, violet-bordered) — `audit contract` · `trace funds` ·
  `profile wallet` · `find rug vectors` · `decode unknown tx` ·
  `monitor address`
- Right side: `target picker` — a small input that accepts address,
  tx hash, ENS, or contract name, with an icon that flips type
  (wallet / contract / tx / ens) based on inferred input.

### 6b. SWARM PLAN (middle, ~ 40 % height) — BLUE zone
The moment the user types or pastes a target, render a real-time
"execution plan" that shows which agents will be dispatched. This
panel reads as *system output*, so accent color is **blue**.

Each agent is a row:

  ┌──────────────────────────────────────────────────────────┐
  │ ● scout-fetch          // pulls tx history, balances     │
  │   somnia json-fetch    via blockscout api                │
  │   cost: 0.42 STT       eta: ~ 4s                         │
  ├──────────────────────────────────────────────────────────┤
  │ ● contract-decoder     // disassembles bytecode + abi    │
  │   somnia llm-inference reads source if verified          │
  │   cost: 0.81 STT       eta: ~ 9s                         │
  ├──────────────────────────────────────────────────────────┤
  │ ● flow-tracer          // graph walks counterparties     │
  │   somnia llm-tools     up to 3 hops                      │
  │   cost: 1.20 STT       eta: ~ 14s                        │
  ├──────────────────────────────────────────────────────────┤
  │ ● synthesizer          // composes the dossier           │
  │   somnia llm-inference verifies citations                │
  │   cost: 0.68 STT       eta: ~ 6s                         │
  └──────────────────────────────────────────────────────────┘

- Bullet `●` in **accent/blue**, softly pulsing while idle.
- Numbers (cost, eta) in tabular blue mono.
- Comments (`// …`) in ink/muted.
- Rows have a 1 px hairline gradient on hover.

### 6c. DISPATCH BAR (bottom strip, fixed) — mixed zone
Left:  cost breakdown ledger, monospace, right-aligned numbers
       (all numbers in **accent/blue** — system computation):
       `agents       3.11 STT`
       `service +50%  1.55 STT`
       `────────────────────`
       `total        4.66 STT   ≈ $0.47`

Right: the big button (user action — **violet**):
       `[ > dispatch swarm ]`
       Full-bleed violet on hover, a subtle pixel-shatter animation
       (cells of the button briefly scatter then reform).

### 6d. RUNTIME STATE (replaces 6b once dispatched)
Each agent row transitions into a live execution row (still BLUE zone):
- Status pill cycles: `queued → invoking → executing → consensus → done`
  (pill bg accent/blue @ 20 %, text accent/blue, "done" flips to lime)
- A miniature 1-line log streams beneath each row in ink/muted
  (use convincing fake telemetry — `eth_call 0x70a08231 → 0x00…1f4`,
  `parsed 142 logs`, `consensus 5/7 nodes ✓`).
- A horizontal progress bar (1 px tall, **accent/blue**) fills as the
  agent advances.
- Once done, the row collapses into a single-line summary with a
  `view receipt ↗` link (opens a modal showing the on-chain audit
  receipt — fake ABI-encoded data is fine).

When all agents complete, a `> dossier ready` chip appears with a
**violet** glow (user-relevant outcome), expanding into the Sample
Investigation section below.

---

## 7. AGENT SWARM DIAGRAM  (animated, explains the model)

Section heading: `> the swarm`  (ink/primary, violet `>`)

A full-width canvas, ~ 520 px tall, dark with a thin **blue** grid
(system schematic).

Render a live force-directed graph:
- Center node: `intent` — **violet** ring, label "your prompt" (user-owned).
- Surrounding nodes: 4–6 agents (scout, decoder, tracer, synth, …)
  drawn as small **blue** squares with mono labels (system).
- Around them, dozens of "data" nodes (transactions, contracts,
  wallets) appear and disappear as the graph "investigates" — these are
  ink/secondary outlines.
- Edges are 1 px **accent/blue** lines with a flowing dash (data movement).
- Every few seconds, an "evidence" node lights **amber**, gets pulled
  toward the synth node, and is absorbed.
- The final report stream from synth back to `intent` is a 1 px
  **violet** line (the system's answer returning to the user).
- Bottom-right legend, mono 12 px, explains glyphs.

Caption to the right of the graph (ink/secondary):
  `non-deterministic LLMs reach consensus via fixed seeds and
   majority validation across somnia nodes. every step leaves
   an audit receipt on-chain.`

---

## 8. CAPABILITIES GRID  (3 × 2, what users can ask)

Section heading: `> what the swarm can answer`

Six tiles, each 1 px bordered, 24 px padding, hover = **violet** border + 4 px
upward translate with shadow. Each tile:

  Icon-glyph (pixel-art, 32 × 32, mono, accent/blue stroke):
  Title (mono, 18 px, ink/primary):
  Body (mono, 13 px, ink/secondary, 3 lines max):
  Footer chip (violet-bordered, sample user intent):
  `> example: <sample prompt>`

Tiles:
1.  **contract forensics** — reads source, bytecode, storage slots; flags
    backdoors, infinite mint, ownership traps.
    `> example: "audit 0xabc…"`
2.  **fund-flow tracing** — graph-walks counterparties up to N hops,
    detects mixers, bridges, splits.
    `> example: "where did the airdrop go?"`
3.  **stealth-launch detection** — finds projects building quietly:
    deployer wallets, factory contracts, pre-announcement activity.
    `> example: "what is @project building?"`
4.  **wallet profiling** — behavioral fingerprint, counterparty graph,
    risk score, MEV / sybil hints.
    `> example: "profile 0xdef…"`
5.  **token & nft x-ray** — supply, holders, concentration, mint history,
    royalty traps, hidden permissions.
    `> example: "x-ray token X"`
6.  **continuous watch** — set the swarm to keep watching and ping
    you on-chain when something changes.
    `> example: "alert me if owner renounces"`

---

## 9. COST & RECEIPTS STRIP  (transparency band)

Full-width, 240 px tall, bg/raised.

Left column — a faux ledger (numbers in **accent/blue**):
  `> billing model`
  `   agent_cost  Σ(agent.fee · invocations)`
  `   service     agent_cost × 0.50`
  `   total       agent_cost + service`
  `   currency    STT  (somnia testnet token)`

Right column — a faux on-chain audit receipt rendered in mono with
a soft **blue** inner glow (system artifact):
  ```
  receipt 0x7f3a…d2c1
  agent       llm-inference
  function    inferToolsChat
  nodes       7  (consensus 6 / 7)
  gas         412,308
  ts          2026-05-24T12:18:44Z
  ─ output ────────────────────────
  { "verdict": "contract has owner-only
     mint without timelock; severity high" }
  ```

The receipt block has a `[ view on explorer.somnia.network ↗ ]` link
(violet underline on hover — user action).

---

## 10. SAMPLE INVESTIGATION  (a worked example)

A long scroll-narrative section showing a fake but believable
investigation, formatted like a forensic dossier:

Header banner (mono, ink/primary, violet `>`):
  `> dossier #002418`
  `> prompt: "follow funds from 0xdrop… and flag mixers"`
  `> dispatched  2026-05-24 11:42 utc`
  `> nodes 7 · agents 4 · duration 38s · cost 4.66 STT`  (numbers in blue)

Sections (each with its own 1-px bordered panel):
1. **summary** — three bullet conclusions, mono, large, ink/primary.
2. **timeline** — vertical timeline with monospace timestamps (blue) and
   short event descriptions; nodes light **violet** when hovered (user
   focus).
3. **flow graph** — a static SVG sankey-style chart in **blue strokes**,
   amber on flagged paths, red on the worst path; hovering an edge
   reveals tx hash and amount.
4. **flagged items** — three cards, each with a severity chip
   (`high`, `med`, `low`) colored signal/red, amber, lime.
5. **citations** — list of receipts, each linking to a fake
   explorer URL; mono, ink/secondary, violet hover underline.

End the section with:
  `[ download dossier (.md / .pdf) ]   [ share read-only link ]`
  ghost buttons, hover = **violet** underline.

---

## 11. FOOTER  ("built on somnia")

Full-bleed, ~ 360 px tall, near-black bg with a faint pixel-grid
fade-out at the top edge.

Left:
  Big mark `[ {s} ] hinyAudit`  (violet `{s}`)
  Tagline:  `> a swarm. a ledger. a verdict.`
  Small chips (blue-bordered):  `chain 5031` · `agentic L1` · `phase 1`

Center columns (mono, 13 px, ink/secondary):
  product       docs           community
  console       agents         telegram
  swarm         api            discord
  pricing       receipts       x
  changelog     whitepaper     github

Right:
  `> built on somnia` with the official-style `{s}` mark to the right
  (violet `{s}`).
  Below it: `submission · somnia agentathon · 2026`.

Bottom hairline + microcopy:
  `© 2026 {s}hinyAudit · no custody · read-only on-chain · use at own risk.`

---

## 12. GLOBAL MICRO-INTERACTIONS  (apply everywhere)

- **Cursor**: replace default with a 12 px mono caret on interactive
  surfaces; on idle panels, no change.
- **Selection**: text-selection bg = accent/violet @ 40 %, text = black.
- **Focus rings**: 1 px solid accent/violet, offset 2 px, no glow halo.
- **Hover lift**: interactive tiles translate up 4 px with a 1 px violet
  border and a 0 px → 24 px violet shadow at 20 % opacity.
- **Loading**: a single-row mono spinner using rotating glyphs `| / − \`
  in accent/blue.
- **Transitions**: 180 ms ease-out for color/border; 320 ms ease-out
  cubic for layout. No bouncy springs.
- **Sound (if supported)**: subtle key-click (3 ms blip) on terminal
  input, and a soft "tape-reel" tick when an agent completes.
  Default OFF, toggle in nav.

---

## 13. EASTER-EGG / DELIGHT MOMENTS  (do all of these)

- Press `/` anywhere → focuses the intent input.
- Type `> sudo dispatch` in the intent box → entire page briefly
  glitches (RGB-shift 80 ms) and the cost ledger temporarily shows
  `service +0%` with a mono note `> founder mode`.
- Idle for 30 s → the pixel-grid background slowly forms the
  silhouette of the `{s}` mark, then dissolves.
- Konami code → swap the violet accent to lime for the rest of the
  session; persist nowhere.

---

## 14. RESPONSIVENESS

- Desktop ≥ 1280 px: full layout as described.
- Tablet 768–1279: hero stays full, right-side ambient panel hides,
  console becomes single column, swarm diagram simplifies to 4 nodes.
- Mobile < 768 px: hero condenses, type to 64 px, chips wrap, console
  stacks; swarm diagram becomes a static SVG; nav collapses to a
  bracketed menu `[ ≡ ]`.

---

## 15. WHAT NOT TO DO

- No rounded corners > 2 px.
- No gradients that mix violet → blue. Keep the two accents disjoint.
- No gradients longer than 1 stop; no glassy, no glossy, no skeuomorphic.
- No emoji. No clip-art icons. No stock photography.
- No "AI sparkle" tropes (rainbow gradients, magic wands).
- No bouncy / cute animations. Keep it forensic.
- No light-mode variant — this product is dark by definition.

---

## 16. DELIVERABLE

A single responsive React (Next.js app router) + Tailwind page,
TypeScript, with Framer Motion for orchestrated animations and
react-three-fiber (or pure SVG + canvas) for the swarm graph.
Use lucide-react icons sparingly; prefer custom 32 × 32 pixel-art
SVGs for capability tiles. Pure client-side; mock all data in
`lib/mock.ts`.

Component file layout:
  app/page.tsx
  components/Nav.tsx
  components/Hero.tsx
  components/PixelGrid.tsx        ← canvas, animated
  components/Console.tsx          ← the centerpiece
  components/SwarmPlan.tsx
  components/SwarmGraph.tsx       ← animated graph
  components/Capabilities.tsx
  components/CostStrip.tsx
  components/Dossier.tsx          ← sample investigation
  components/Footer.tsx
  lib/mock.ts                     ← all fake data + telemetry
  styles/tokens.css               ← color + typography variables

Ship it as if a Somnia judge will see this on day one and decide
right there whether to interview the builder. Make it that good.
