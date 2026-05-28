# PROJECT: {s}hinyAudit — Chat-Style Investigator (V2 spec, FUNCTIONAL)

## Context (read this first)

We're building an agent-native on-chain investigator on Somnia's Agentic L1 for
the Somnia Agentathon 2026. Backend already works end-to-end:

- Next.js 15 app with wagmi/viem wallet connect to Somnia testnet
- `ShinyAuditEscrow` contract is deployed at `0x37b641f63a7ab2da0abf2c033c1c30819b049b36`
  on Somnia testnet — user pre-funds credit once, server-side orchestrator
  drains it per agent step (50% of every agent deposit becomes platform revenue)
- Orchestrator dispatches real Somnia agents (`json-fetch`, `llm-inference`,
  `llm-parse-website`) via `createRequest()` on platform `0x037Bb...6776`,
  waits for `RequestFinalized` event, decodes the response, streams to UI
- We already proved end-to-end with a live agent receipt:
  https://agents.testnet.somnia.network/receipts/1646254

**The previous design has a static "Console" section** (intent textarea + agent
plan rows + dispatch button + runtime view + sample dossier). **Throw that out.**
Everything else on the landing page stays — nav, hero, swarm-graph section,
capabilities grid, cost strip, footer.

We need a real **conversational chat experience** in its place — like the
Somnia "AMA" screen attached, but for forensic on-chain investigations.

The user has a Figma file for the **visuals** (colors, layout, typography).
**This prompt only describes FUNCTIONALITY, CONTENT, and BEHAVIOR** — what
the chat does, what each agent reply contains, how streaming feels. Take
visual decisions from the attached Figma; take functional decisions from
this file.

---

## 1. The chat metaphor

The user is an investigator. The system is a swarm of on-chain Somnia agents
that read the Somnia blockchain on the user's behalf. Conversation alternates:

```
> user:    natural-language question + optional target (wallet/contract/tx)
> swarm:   structured forensic answer with citations to on-chain receipts
> user:    follow-up question (the swarm remembers previous turns)
> swarm:   refined answer
...
```

Every swarm reply is the streamed result of one or more real, on-chain agent
invocations. Each invocation has a verifiable receipt on
`agents.testnet.somnia.network/receipts/<id>`. Every receipt link must be
clickable in the chat reply.

---

## 2. Use cases — what the user can ask (CORRECTED)

These are the canonical question types the swarm must handle well.
Each one demonstrates a different "shape" of investigation. The chat should
recognize the question type from the prompt and adapt its answer accordingly.

### 2.1 Smart-contract audit (verified source)

> "Audit `0xabc...` — I'm thinking of integrating with it. What are the risks?"
>
> "I'm the founder of this contract — what would an attacker see?"
>
> "What does `0xabc...` actually do? Read the source and tell me in plain words."

The swarm pulls the **verified source code** from Shannon Explorer
(via `json-fetch`), feeds it to `llm-inference` configured as a Solidity
security auditor, and returns:

- One-sentence verdict + overall risk score (0–100, color-coded)
- 3–6 findings sorted by severity (high / med / low), each with:
  - Title (e.g. "Owner-only mint without timelock")
  - Code snippet showing the offending function (syntax-highlighted)
  - Plain-English explanation
  - Suggested mitigation
- "Founder view" toggle vs "User view" toggle — same findings, different framing:
  - **Founder:** "your contract has X — attackers will exploit it like Y"
  - **User:** "this contract gives the deployer power to Z — risk to your funds is W"
- Verdict citations: receipt links to the agent invocations that produced this audit

### 2.2 Wallet safety profile

> "Profile `0xdef...` — is this wallet safe to receive funds from?"
>
> "What has this wallet been doing for the last 30 days?"
>
> "Show me every contract this wallet has interacted with in the last week."

The swarm pulls tx history via `json-fetch` (Blockscout API), then
`llm-inference` classifies counterparties and behavior. Returns:

- Behavioral fingerprint card: age of wallet, tx count, gas spent, primary
  activity pattern (DeFi user, MEV searcher, sybil, fresh, etc.)
- Counterparty graph: top N addresses this wallet interacted with, classified
  (CEX deposit, DEX, bridge, mixer, contract deployer, EOA…)
- Risk score: 0–100 with one-sentence rationale
- Time-range picker: user must be able to constrain to "last X days" before
  asking, and the answer respects it
- Red flags if any: interactions with known mixer addresses, sudden activity
  spike, dusting pattern

### 2.3 Drop / claim follow-through ("where did the money go?")

> "Drop X happened on date Y. The top-1 allocation went to `0xfoo...`.
> What did they do with it? Did they accumulate more? Bridge out? Sell on a CEX?"
>
> "Trace funds from this airdrop wallet through 3 hops and tell me the verdict."

This is the hardest case — multi-hop fund-flow tracing. The swarm:

1. Confirms the starting balance / received amount on the airdrop date
2. Walks outgoing transactions hop by hop (up to 3 hops by default, user
   adjustable)
3. Classifies each terminal address (held, CEX, bridge, DEX swap, transfer to
   another wallet, mixer)
4. Returns a verdict: **"held N%", "sold M% via DEX", "bridged out K%",
   "deposited to CEX (likely sold) P%"**
5. Shows a sankey-style flow visualization (the kind already in our existing
   `Dossier` component — reuse the SVG)
6. Lists every hop with tx hash + amount + receipt link

The user can ask follow-ups like *"who did wallet B forward it to?"* — chat
remembers the graph and drills deeper without re-asking the date.

### 2.4 Stealth-launch discovery ("what is project X secretly building?")

> "Project Foo announced on Twitter but hasn't launched. They probably
> have a deployer wallet active. Find what they're building on Somnia."

The swarm parses Foo's public site (`llm-parse-website`) for any wallet
addresses or contract addresses mentioned, then `json-fetch` scans those
addresses' recent contract deployments and outgoing factory calls, then
`llm-inference` summarises what's been deployed.

Result: a list of contracts the project deployed but hasn't announced, with
function summaries and rough categorization (DEX, NFT mint, staking, etc.).

### 2.5 Token / NFT x-ray

> "X-ray token `0xtok...` — is supply concentrated? Hidden permissions?
> Royalty traps?"

Output:

- Supply, holders count, top-10 concentration % (with names if known)
- Mint history graph (new mints per day for the last 30 days)
- Hidden permissions: pausable, blacklistable, fee-on-transfer, max-tx, etc.
- Royalty config for NFTs
- Verdict: tradeable / restricted / suspicious

### 2.6 Continuous watch

> "Watch `0xfoo...` and ping me here if the owner renounces or a new
> privileged function is added in the next 7 days."

Returns a confirmation card with the watch terms + estimated cost (per check),
schedules a recurring on-chain check via Somnia agents, and posts subsequent
"alert" messages into the chat when conditions trigger.

(For the MVP, the watch panel can show a "pending" state with a manual
"refresh now" button — full cron wiring is post-hackathon.)

### 2.7 Unknown / free-form

If the user asks something we don't have a template for, the LLM-inference
agent does a best-effort interpretation, the planner picks the most relevant
sub-set of tools, and the chat reply is annotated with "free-form
interpretation — verify before acting."

---

## 3. Chat layout — required regions

Take colors/typography from the user's Figma. These regions must exist:

### 3.1 Persistent shell
- The existing **nav** (logo + wallet connect + nav links) stays sticky at top
- The existing **hero**, **swarm-graph**, **capabilities**, **cost strip**,
  **dossier example**, **footer** remain on the marketing landing page
- The chat is its OWN dedicated section (id `chat`), replacing the old
  `console` section. The hero CTA "dispatch a swarm" scrolls to the chat.
- A bottom navigation/route option `/chat` makes the chat full-screen for
  power users (optional, V1 can keep it as a section)

### 3.2 Chat session UI (the centerpiece)

Three logical zones inside one chat panel:

**Header strip** (always visible above messages):
- Session id (something like `dossier-#0241` — same numbering as old dossier)
- Live agent budget bar: `credit X.XXX STT · est. next reply Y.YY STT · enough for Z more turns`
- Quick actions: `[ new session ]` `[ download .md ]` `[ share read-only link ]`

**Messages list** (scrollable, newest at bottom, auto-scrolls on new):
- User messages
- Swarm replies (see anatomy in §4 below)
- System notes (light, italicized — e.g. "low credit, top up to continue")

**Composer** (sticky bottom):
- Multiline textarea, auto-resize, `Enter` sends, `Shift+Enter` newline
- Slash commands: typing `/` opens a menu of canned investigation templates
  (`/audit 0x…`, `/profile 0x…`, `/trace 0x…`, `/watch 0x…`, etc.)
- Target picker chip — same as the previous design (detects address/tx/ens),
  shown left of the send button
- Send button (or `⏎`)
- Inline cost hint as the user types: `≈ 0.45 STT for this question`

---

## 4. Swarm reply anatomy

A swarm reply is NOT a single text bubble. It's a structured message with
the following parts, in this order, rendered top-to-bottom:

### 4.1 Reply header (one tight strip)
- Reply icon / avatar (something Somnia-branded — the `{s}` mark in a tile)
- Reply title — auto-generated from the question (e.g. `audit · 0xabc…7c2`)
- Total cost line: `4 agents · 1.84 STT (incl. service)` + a tooltip
  breaking that into `agents 1.23 STT + service 0.61 STT`
- Sealed-immutable badge once the reply is finalized
- Right-aligned link `view all receipts ↗`

### 4.2 Live agent strip (while running, collapses to summary when done)
Streamed timeline of the agents working on this answer. As each step
progresses, render a small inline card per step:

```
●  scout-fetch        // pulled 203 tx via blockscout
     ▸ tx 0x…  ✓ consensus 6/7      receipt ↗
●  contract-decoder   // reading verified source
     ▸ tx 0x…  · waiting consensus  spinner
○  flow-tracer        // queued
○  synthesizer        // queued
```

- Pulsing dot while running, lime check when done, red when failed
- Each completed step exposes its receipt link inline
- When the whole reply finishes, the strip collapses into a single line:
  `4 agents · 38s · receipts ✓` (click to re-expand)

### 4.3 Verdict block (THE primary content)
A single, prominent verdict tile. Color and icon depend on the question type:
- audit → shield + risk score chip
- profile → wallet glyph + safety chip
- trace → flow glyph + "verdict: 78% sold via CEX" headline
- x-ray → token glyph + tradability chip
- watch → bell glyph + "watch active until <date>"

The verdict block is short (one paragraph max) and ALWAYS appears, even if
the agents failed (in that case: "verdict unavailable, here's what we got").

### 4.4 Findings / details (rich content sections)
After the verdict, render zero-or-more **content blocks** depending on what
the agents produced. These are the supported block types — the LLM picks
which to emit by returning structured JSON:

| Block type        | Renders as                                                                 |
|-------------------|-----------------------------------------------------------------------------|
| `markdown`        | rendered markdown (headings, lists, links, inline code)                     |
| `code`            | syntax-highlighted Solidity / JSON / shell snippet (copy button)             |
| `kv-table`        | two-column key/value table (e.g. "supply, holders, top-10")                  |
| `risk-card`       | severity chip (high/med/low/red/amber/lime) + title + body + ref tx         |
| `risk-card-list`  | list of risk-cards                                                          |
| `sankey-flow`     | reuse our existing SVG sankey (used in §2.3 fund-flow tracing)              |
| `counterparty-graph` | force-directed mini-graph (reuse `SwarmGraph` component visuals)         |
| `timeline`        | vertical timeline with timestamps and short event descriptions               |
| `mint-chart`      | tiny inline sparkline / bar chart for token mints over time                  |
| `address-chip`    | clickable inline chip showing short addr → explorer link, tag if known       |
| `tx-chip`         | clickable inline chip for tx hash → explorer + receipt page                  |
| `callout`         | colored notice strip (info / warn / danger) with one short line              |
| `image`           | inline image (e.g. NFT preview rendered from on-chain URI)                   |

The LLM may interleave blocks freely. Example for an audit reply:

```
[verdict] high risk · score 22/100
[markdown] short summary paragraph
[risk-card-list]
  ● HIGH · owner-only mint, no timelock        tx 0xa1f…7c2
  ● MED  · pausable transfers                  function pause() ↗
  ● LOW  · missing events on critical setters  function setFee() ↗
[code language=solidity]
  function emergencyMint(uint256 amount) external onlyOwner {
      _mint(msg.sender, amount);
  }
[callout warn] this function lets the owner mint unlimited supply at any time
[kv-table]
  contract       0xabc…7c2
  deployer       0xdrop…ae9
  verified at    2026-04-12
  compiler       solc 0.8.24
  optimizer      enabled · runs 200
[address-chip] 0xdrop…ae9   ← deployer (linked to 3 prior rugs)
```

### 4.5 Citations footer (always last)
A compact, copy-friendly list of every Somnia receipt this reply used:

```
citations
  0x7f3a…d2c1  · synthesizer · consensus 6/7   receipt ↗
  0x1d77…b04   · flow-tracer · hop 2           receipt ↗
  0xabc9…1f4   · contract-decoder · slot 7     receipt ↗
  0x44c9…e8a   · scout-fetch · txlist          receipt ↗
```

Plus the "expand raw outputs" toggle to show the raw JSON of every agent's
final response (for power users / auditors).

---

## 5. Streaming behavior (this is what makes it feel alive)

The reply must stream in, not appear all at once. Specific stages:

1. **Plan stage** (≈ 200 ms after user sends): a system-grey ephemeral line
   appears at the top of the upcoming reply: `> planning… (selecting agents)`
2. **Plan reveal**: the live agent strip (§4.2) renders all queued agents
   at once with `○` icons and "queued" status. The composer is disabled.
3. **Per-step streaming**: each agent's row pulses, then transitions to
   "executing", then "consensus", then "done". Inline log lines update
   beneath the row (`eth_call …`, `parsed 142 logs`, `consensus 5/7 ✓`).
   Real tx hashes and receipt URLs replace placeholders as they arrive.
4. **Verdict streaming**: once the synth agent fires, the verdict block
   types in character-by-character (like Claude streaming). Then content
   blocks render in order, fading in one by one.
5. **Citations finalize**: appear last with a subtle highlight.
6. **Composer re-enables** with a small confirmation: `+ ask a follow-up`.

If any step fails mid-stream, the reply still finalizes with whatever was
produced + a `[callout danger]` explaining what broke + the partial citations.

---

## 6. User messages

User messages are short. Each user message has:
- The text (whatever the user typed)
- Inferred metadata chips below it, in muted color:
  - Target: `wallet 0xdef…` / `contract 0xabc…` / `tx 0x…`
  - Question type: `audit` / `profile` / `trace` / `x-ray` / `watch` / `free-form`
  - Cost estimate when sent: `est 1.84 STT`
- Edit + retry icons appear on hover (re-runs the same prompt as a fresh reply)

---

## 7. Sessions, memory, history

- Sessions are stored locally (`localStorage`) keyed by wallet address
- Sidebar (or top dropdown) lists the user's recent sessions:
  - Session title (auto-generated from first user message)
  - Date, number of turns, total cost in STT
  - Click → loads that session
- "New session" button clears the current chat and starts fresh
- Within a session, the swarm has memory: prior verdicts + cited receipts are
  available to subsequent prompts (orchestrator prepends a compact context
  summary to each follow-up planner call)

---

## 8. Empty state (no messages yet)

When the chat opens for a fresh session, the messages area shows:

- One brand-aligned welcome line — "ask the swarm anything that lives on Somnia"
- A **quick-start grid** of 6 canned questions matching §2 use cases, e.g.:
  - 🛡 audit a contract `> /audit 0x…`
  - 👤 profile a wallet `> /profile 0x…`
  - 💸 trace fund flow `> /trace 0xdrop... 3 hops`
  - 🥷 find stealth deployments `> /stealth @project`
  - 🔬 x-ray a token  `> /xray 0xtok…`
  - 🔔 watch for changes `> /watch 0x… owner renounces`
- Each tile, when clicked, drops the slash-command into the composer for
  the user to fill in the address
- A bottom hint: `your first question costs ≈ 1.8 STT · escrow credit shown above`

---

## 9. Billing presence in the chat (don't hide it — own it)

- Above the composer, a thin strip permanently shows:
  - `credit X.XXX STT` (link → opens deposit modal)
  - `last reply Y.YY STT · session total Z.ZZ STT`
- If credit < estimated cost of next question, the send button is disabled
  with an inline `+ top up X STT` shortcut that opens the deposit modal
- The deposit modal is the existing `CreditPanel` component — slide-in panel
  on the right or modal in the center, designer's choice

---

## 10. Tone

The swarm replies in calm, terse, technical English. No emoji noise inside
the reply text itself (block icons are allowed). Verdicts are confident but
hedged with citations. If the source code wasn't verified, the agent says
so plainly: "this contract isn't verified — bytecode-only audit is shallow,
treat findings as low-confidence."

---

## 11. What stays from the previous spec

- Brand mark `{s}` in violet, monospace everywhere
- Pixel-grid backgrounds and scanlines stay on the marketing sections
- `>` prompt prefix for all headings and CTAs
- Cost transparency (every receipt linked, every cost shown)
- Easter eggs from V1: `/` focus, `> sudo dispatch` for founder mode,
  Konami code, idle silhouette

## 12. What changes vs the previous spec

- The "console" section in `components/Console.tsx` is REPLACED with a chat
  component (`components/Chat.tsx`)
- The static "execution plan grid → dispatch button → runtime view → sample
  dossier" lives inside each swarm reply now, not as standalone page sections
- The existing `Dossier` sample section becomes the **6th content block type**
  rendered inside chat replies (sankey + flagged items + citations all live
  inside one reply)

---

## 13. Deliverable

A self-contained chat component spec (component tree + state model + behavior)
that the user's developer (me) can implement in Next.js 15 + Tailwind +
framer-motion, plugging into the existing SSE endpoint at `/api/investigate`
and the existing `ShinyAuditEscrow` contract.

Take **visual decisions** (palette, typography, spacing, exact corner radii,
animations easing) from the Figma the user will attach. This document fixes
the **functional** model only.

---

End of spec.
