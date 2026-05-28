/* demo-data.js — pre-seeded conversation for {s}hinyAudit chat */

const DEMO_SESSION = {
  id: "dossier-#0241",
  startedAt: "2026-05-25 14:21 UTC",
  credit: 24.380,            // STT remaining in escrow
  sessionTotal: 6.124,       // STT spent this session
  lastReply: 1.842,
  turns: 2,
};

const SHORT_ADDR = (a) => a.slice(0, 6) + "…" + a.slice(-4);

/* -------- agent step icons ------- */
const AGENT_KINDS = {
  "scout-fetch":      { glyph: "↻", color: "var(--blue)"   },
  "contract-decoder": { glyph: "≣", color: "var(--purple)" },
  "auditor-llm":      { glyph: "∇", color: "var(--purple)" },
  "flow-tracer":      { glyph: "↬", color: "var(--blue)"   },
  "classifier":       { glyph: "▥", color: "var(--blue)"   },
  "synthesizer":      { glyph: "Σ", color: "var(--purple)" },
};

/* ============================================================
   MESSAGE 1 — user audit request
   ============================================================ */
const M1_USER = {
  id: "u1",
  role: "user",
  text:
    "Audit 0xabc92f7c1fae0a6b1f4d9b8e2c3a5d7e90f8c2b7c2 — I'm thinking of integrating it as a payment rail for my checkout flow. What are the risks?",
  target: { kind: "contract", addr: "0xabc92f7c1fae0a6b1f4d9b8e2c3a5d7e90f8c2b7c2" },
  qtype: "audit",
  costEst: 1.82,
  costFinal: 1.842,
};

/* ============================================================
   MESSAGE 2 — swarm audit reply (FINISHED, fully populated)
   ============================================================ */
const M2_SWARM = {
  id: "s1",
  role: "swarm",
  status: "done",
  title: { kind: "audit", target: "0xabc9…2b7c" },
  costTotal: 1.842,
  agentsCost: 1.231,
  serviceCost: 0.611,
  sealed: true,
  duration: 42,
  view: "user", // user | founder
  agents: [
    {
      id: "a1",
      name: "scout-fetch",
      status: "done",
      meta: "pulled verified source · 14.2KB · solc 0.8.24",
      logs: [
        { txt: "GET shannon-explorer.somnia.network/api?addr=0xabc9…",  receipt: "0x7f3a…d2c1" },
        { txt: "decoded ABI · 18 funcs · 11 events",                    receipt: null },
      ],
    },
    {
      id: "a2",
      name: "contract-decoder",
      status: "done",
      meta: "parsed source tree · ast 4.1k nodes",
      logs: [
        { txt: "found 3 onlyOwner gates, 1 nonReentrant",               receipt: null },
        { txt: "consensus 6/7 ✓",                                       receipt: "0xabc9…1f4" },
      ],
    },
    {
      id: "a3",
      name: "auditor-llm",
      status: "done",
      meta: "claude-sonnet · solidity-security-v3",
      logs: [
        { txt: "scored 6 findings · 1 high · 2 med · 3 low",            receipt: "0x44c9…e8a" },
      ],
    },
    {
      id: "a4",
      name: "synthesizer",
      status: "done",
      meta: "ranked · verdict assembled",
      logs: [
        { txt: "consensus 6/7 ✓ · sealed at block 8,471,236",           receipt: "0x1d77…b04" },
      ],
    },
  ],
  verdict: {
    tone: "amber",                     // lime | amber | red
    glyph: "shield",
    label: "verdict",
    headline: "Functional but custodial. The deployer keeps unlimited mint authority — risk is concentrated in one EOA.",
    score: 42,
    scoreLabel: "risk score / 100",
  },
  blocks: [
    {
      type: "markdown",
      text:
        "**SomniaPay v1.3** is a payment-rail wrapper around a custom `ERC20` token. " +
        "Logic is sane and the reentrancy guard is in place, but **two privileged paths** make this a poor choice for a checkout integration where you cannot monitor the deployer in real time.\n\n" +
        "If your integration only **receives** payments (does not custody supply), the practical surface is small. If you **hold balances** on behalf of users, you inherit the issues below.",
    },
    {
      type: "risk-list",
      hasViewToggle: true,
      itemsByView: {
        user: [
          {
            sev: "high",
            title: "Owner-only `emergencyMint` without timelock",
            desc:
              "The deployer can mint unlimited supply at any time. There is no cap, no timelock, and no governance vote. A compromised key drains every holder pro-rata — your balance dilutes to dust.",
            ref: { txt: "function emergencyMint(uint256)", tx: "0xabc9…1f4" },
            aside: "L23–L31",
          },
          {
            sev: "med",
            title: "Pausable transfers · single-key trigger",
            desc:
              "`pause()` halts all transfers including yours. Same EOA controls it. Acceptable for a payment processor; not acceptable for a token you hold.",
            ref: { txt: "function pause() · function unpause()", tx: "0x7f3a…d2c1" },
            aside: "L88–L102",
          },
          {
            sev: "med",
            title: "Fee-on-transfer up to 5%",
            desc:
              "A configurable `_feeBps` reduces transferred amount silently. Your wallet shows the gross but you receive less. Trades made without checking the latest fee rate under-deliver to your account.",
            ref: { txt: "function setFee(uint16)", tx: "0x44c9…e8a" },
            aside: "L141–L158",
          },
          {
            sev: "low",
            title: "Missing events on critical setters",
            desc: "Setters change behaviour without emitting events — your monitoring tools won't catch the change. You can be rugged silently between transfers.",
            ref: { txt: "3 setters · 0 events", tx: "0x1d77…b04" },
            aside: "L161, L173, L189",
          },
        ],
        founder: [
          {
            sev: "high",
            title: "Attackers will target your owner key first",
            desc:
              "Your `emergencyMint` gives the owner key full supply control with no on-chain delay. The moment your key is phished, drained or socially engineered, the attacker mints to themselves and dumps. This is the #1 exploit pattern for tokens of your shape.",
            ref: { txt: "function emergencyMint(uint256)", tx: "0xabc9…1f4" },
            aside: "fix: timelock + cap",
          },
          {
            sev: "med",
            title: "Single-key pause is a coordination liability",
            desc:
              "If you ever lose access to the owner key while paused, the token bricks. Move pause behind a 2-of-3 multisig before mainnet — Gnosis Safe deploy on Somnia costs ≈ 0.04 STT.",
            ref: { txt: "function pause() · function unpause()", tx: "0x7f3a…d2c1" },
            aside: "fix: multisig",
          },
          {
            sev: "med",
            title: "Silent fee changes will erode integrator trust",
            desc:
              "DEX aggregators that route through SOPAY will mis-quote when you change `_feeBps`. Emit `FeeUpdated(oldBps, newBps)` so integrators can subscribe and adjust mid-flight. Without this, integrations will quietly route around your token.",
            ref: { txt: "function setFee(uint16)", tx: "0x44c9…e8a" },
            aside: "fix: emit events",
          },
          {
            sev: "low",
            title: "Missing events = harder to integrate",
            desc: "Indexers (Subgraph, Goldsky) and monitoring (Tenderly, Forta) can't pick up state changes that don't emit. Add events on all setters — costs ~200 gas each, unlocks the ecosystem.",
            ref: { txt: "3 setters · 0 events", tx: "0x1d77…b04" },
            aside: "fix: emit events",
          },
        ],
      },
      // legacy field for renderer fallback
      items: null,
    },
    {
      type: "code",
      lang: "solidity",
      title: "high-severity path",
      lines: [
        { tokens: [["com", "// SomniaPay.sol  ·  line 23"]] },
        { tokens: [
          ["kw", "function"], ["pun", " "],
          ["fn", "emergencyMint"], ["pun", "("],
          ["typ", "uint256"], ["pun", " "], ["fn", "amount"],
          ["pun", ") "], ["kw", "external"], ["pun", " "],
          ["fn", "onlyOwner"], ["pun", " {"],
        ]},
        { tokens: [["pun", "    "], ["fn", "_mint"], ["pun", "("], ["fn", "msg.sender"], ["pun", ", "], ["fn", "amount"], ["pun", ");"]] },
        { tokens: [["pun", "}"]] },
        { tokens: [["com", ""]] },
        { tokens: [["com", "// no cap, no event, no timelock — single-EOA controlled"]] },
      ],
    },
    {
      type: "callout",
      level: "warn",
      sym: "//",
      text:
        "This function lets the owner mint unlimited supply at any time. If you settle balances in this token, treat the deployer key as part of your trust boundary.",
    },
    {
      type: "kv-table",
      rows: [
        ["contract",       { v: "0xabc9…2b7c", chip: "tx" }],
        ["deployer",       { v: "0xdrop…cae9", chip: "addr", tag: "linked to 3 prior rugs" }],
        ["verified at",    "block 7,420,981 · 2026-04-12 09:17 UTC"],
        ["compiler",       "solc 0.8.24 · optimizer enabled · runs 200"],
        ["proxy",          "no · direct deployment"],
        ["holders",        "2,184 wallets · top-10 hold 71.2%"],
        ["total supply",   "1,000,000,000 SOPAY (mintable)"],
      ],
    },
  ],
  citations: [
    { hash: "0x7f3a…d2c1", agent: "scout-fetch",      what: "verified source · 14.2KB",   consensus: "6/7", receipt: "https://agents.testnet.somnia.network/receipts/1646254" },
    { hash: "0xabc9…1f4",  agent: "contract-decoder", what: "ast · slot 7 (mint path)",    consensus: "6/7", receipt: "https://agents.testnet.somnia.network/receipts/1646255" },
    { hash: "0x44c9…e8a",  agent: "auditor-llm",      what: "6 findings · ranked",         consensus: "5/7", receipt: "https://agents.testnet.somnia.network/receipts/1646256" },
    { hash: "0x1d77…b04",  agent: "synthesizer",      what: "verdict · 42/100",            consensus: "6/7", receipt: "https://agents.testnet.somnia.network/receipts/1646257" },
  ],
};

/* ============================================================
   MESSAGE 3 — user follow-up: trace
   ============================================================ */
const M3_USER = {
  id: "u2",
  role: "user",
  text:
    "Got it. The deployer 0xdrop…cae9 received the top-1 airdrop allocation on 2026-04-10. Trace it 3 hops and tell me what they did with the money.",
  target: { kind: "wallet", addr: "0xdrop9c8a7b6e5d4f3c2b1a09f8e7d6cae9" },
  qtype: "trace",
  costEst: 2.10,
};

/* ============================================================
   MESSAGE 4 — swarm trace reply (STREAMING — partial)
   ============================================================ */
const M4_SWARM_STREAMING = {
  id: "s2",
  role: "swarm",
  status: "streaming",
  title: { kind: "trace · 3-hop", target: "0xdrop…cae9" },
  costTotal: null,
  agentsCost: null,
  serviceCost: null,
  sealed: false,
  duration: null,
  agents: [
    {
      id: "b1",
      name: "scout-fetch",
      status: "done",
      meta: "pulled 203 txs via blockscout · 2026-04-10 → 2026-05-25",
      logs: [
        { txt: "GET /api?module=account&address=0xdrop…cae9",  receipt: "0xff21…0c4a" },
        { txt: "decoded 203 logs · consensus 7/7 ✓",            receipt: null },
      ],
    },
    {
      id: "b2",
      name: "flow-tracer",
      status: "running",
      meta: "walking outgoing · hop 2 / 3",
      logs: [
        { txt: "hop 1 · 12 outgoing · 4 unique destinations",   receipt: "0x88ee…2211" },
        { txt: "hop 2 · classifying counterparties…",            receipt: null },
      ],
    },
    {
      id: "b3",
      name: "classifier",
      status: "queued",
      meta: "waiting on flow-tracer",
      logs: [],
    },
    {
      id: "b4",
      name: "synthesizer",
      status: "queued",
      meta: "waiting",
      logs: [],
    },
  ],
  verdict: null,
  blocks: [],
  citations: [
    { hash: "0xff21…0c4a", agent: "scout-fetch", what: "203 txs · 0xdrop…cae9",    consensus: "7/7", receipt: "https://agents.testnet.somnia.network/receipts/1646260" },
    { hash: "0x88ee…2211", agent: "flow-tracer", what: "hop 1 · 4 destinations",   consensus: "6/7", receipt: "https://agents.testnet.somnia.network/receipts/1646261" },
  ],
};

/* The completion data — what the trace reply BECOMES once streaming finishes. */
const M4_SWARM_DONE = {
  ...M4_SWARM_STREAMING,
  status: "done",
  sealed: true,
  duration: 38,
  costTotal: 2.118,
  agentsCost: 1.41,
  serviceCost: 0.708,
  agents: [
    { ...M4_SWARM_STREAMING.agents[0] },
    { ...M4_SWARM_STREAMING.agents[1],
      status: "done",
      meta: "walked 3 hops · 14 terminal addresses",
      logs: [
        { txt: "hop 1 · 12 outgoing · 4 unique destinations",   receipt: "0x88ee…2211" },
        { txt: "hop 2 · 9 paths · 7 destinations",              receipt: "0xaa42…91ff" },
        { txt: "hop 3 · 14 terminals classified",               receipt: "0x44dd…7c0b" },
      ],
    },
    { ...M4_SWARM_STREAMING.agents[2],
      status: "done",
      meta: "classified 14 terminals · 100% labeled",
      logs: [{ txt: "3 cex · 2 dex · 1 bridge · 8 held",         receipt: "0x9920…ffbb" }],
    },
    { ...M4_SWARM_STREAMING.agents[3],
      status: "done",
      meta: "verdict assembled · consensus 6/7",
      logs: [{ txt: "synth sealed at block 8,471,602",           receipt: "0xc8a1…2f3d" }],
    },
  ],
  verdict: {
    tone: "red",
    glyph: "flow",
    label: "verdict · fund-flow",
    headline: "78% sold via CEX within 14 days. The deployer holds 9% on the original wallet — the rest is gone.",
    score: 78,
    scoreLabel: "% exfiltrated",
  },
  blocks: [
    {
      type: "sankey",
      title: "fund flow · 0xdrop…cae9 → terminals",
    },
    {
      type: "markdown",
      text:
        "Top allocation received **1,240,000 SOPAY** on **2026-04-10**. Within 14 days, **78% landed on CEX deposit addresses** (likely sold). Another **8%** routed through a bridge to Arbitrum. Only **9%** remains on the original wallet — consistent with a planned exit, not a HODL.",
    },
    {
      type: "kv-table",
      rows: [
        ["initial allocation", "1,240,000 SOPAY · ≈ $84,200 at TGE"],
        ["currently held",     { v: "108,720 SOPAY (9%)", chip: "addr" }],
        ["sold via cex",       { v: "967,200 SOPAY (78%) · 3 destinations", chip: null }],
        ["bridged out",        "99,200 SOPAY (8%) · Arbitrum via Stargate"],
        ["swapped on dex",     "37,200 SOPAY (3%) · Sushi · Camelot"],
        ["latest activity",    "2 hours ago · transferred 4,000 SOPAY to fresh wallet"],
      ],
    },
    {
      type: "callout",
      level: "danger",
      sym: "!!",
      text:
        "Hop-2 wallet 0x12af…77b3 is a known Binance hot-deposit address. Hop-2 wallet 0x9c0d…aa01 is Kucoin. Treat the deployer as a seller, not a holder.",
    },
  ],
  citations: [
    { hash: "0xff21…0c4a", agent: "scout-fetch",  what: "203 txs · 0xdrop…cae9",    consensus: "7/7", receipt: "https://agents.testnet.somnia.network/receipts/1646260" },
    { hash: "0x88ee…2211", agent: "flow-tracer",  what: "hop 1 · 4 destinations",   consensus: "6/7", receipt: "https://agents.testnet.somnia.network/receipts/1646261" },
    { hash: "0xaa42…91ff", agent: "flow-tracer",  what: "hop 2 · 7 destinations",   consensus: "6/7", receipt: "https://agents.testnet.somnia.network/receipts/1646262" },
    { hash: "0x44dd…7c0b", agent: "flow-tracer",  what: "hop 3 · 14 terminals",     consensus: "6/7", receipt: "https://agents.testnet.somnia.network/receipts/1646263" },
    { hash: "0x9920…ffbb", agent: "classifier",   what: "labels · 3cex 2dex 1bridge",consensus: "7/7", receipt: "https://agents.testnet.somnia.network/receipts/1646264" },
    { hash: "0xc8a1…2f3d", agent: "synthesizer",  what: "verdict · 78% sold",       consensus: "6/7", receipt: "https://agents.testnet.somnia.network/receipts/1646265" },
  ],
};

/* ============================================================
   QUICK-START tiles (empty-state grid)
   ============================================================ */
const QUICKSTART_TILES = [
  { icon: "▥", cmd: "/audit",   name: "audit a contract",      ex: "/audit 0xabc…", hint: "verified source · risks · founder-vs-user view" },
  { icon: "◉", cmd: "/profile", name: "profile a wallet",       ex: "/profile 0xdef…", hint: "behaviour · counterparties · risk score" },
  { icon: "↬", cmd: "/trace",   name: "trace fund flow",        ex: "/trace 0xdrop… 3 hops", hint: "sankey · classification · verdict" },
  { icon: "◐", cmd: "/xray",    name: "x-ray a token",          ex: "/xray 0xtok…", hint: "supply · permissions · concentration" },
  { icon: "✦", cmd: "/stealth", name: "find stealth deploys",   ex: "/stealth @project", hint: "scrape site · scan factories · summarise" },
  { icon: "◔", cmd: "/watch",   name: "watch for changes",      ex: "/watch 0x… owner renounces", hint: "cron · alerts in this chat" },
];

const SLASH_COMMANDS = [
  { cmd: "/audit",   desc: "verified-source security audit",     ex: "0xcontract…" },
  { cmd: "/profile", desc: "wallet behaviour + counterparties",  ex: "0xwallet…" },
  { cmd: "/trace",   desc: "multi-hop fund flow tracing",         ex: "0xdrop… 3 hops" },
  { cmd: "/xray",    desc: "token / nft supply + permissions",   ex: "0xtoken…" },
  { cmd: "/stealth", desc: "find unannounced deployments",       ex: "@project | site.com" },
  { cmd: "/watch",   desc: "ongoing monitor with alerts",         ex: "0x… owner renounces" },
];

/* ============================================================
   STREAMING SCRIPT for a NEW user follow-up.
   When the user sends, we type out the same trace done -> done by stages.
   ============================================================ */
const FOLLOWUP_RESPONSE = {
  id: "s3",
  role: "swarm",
  title: { kind: "profile", target: "0xdrop…cae9" },
  costTotal: 1.512,
  agentsCost: 1.01,
  serviceCost: 0.502,
  sealed: true,
  duration: 31,
  agents: [
    { name: "scout-fetch",      meta: "pulled 41 days of tx history · 412 txs",    logs: [{ txt: "GET /api?address=0xdrop… range=41d", receipt: "0x55aa…ddee" }] },
    { name: "classifier",       meta: "labelled 32 unique counterparties",          logs: [{ txt: "5 dex · 2 cex · 3 bridges · 22 eoa", receipt: "0x66bb…ccff" }] },
    { name: "auditor-llm",      meta: "behavioural fingerprint · 1k tokens",        logs: [{ txt: "DeFi-power-user · MEV-adjacent · whale-ish", receipt: "0x77cc…bbaa" }] },
    { name: "synthesizer",      meta: "verdict assembled · sealed",                 logs: [{ txt: "score 36/100 · medium risk", receipt: "0x88dd…aabb" }] },
  ],
  verdict: {
    tone: "amber",
    glyph: "wallet",
    label: "verdict · wallet",
    headline: "Active DeFi power-user, 19-month wallet age, no mixer interactions — but the recent SOPAY exits are a behaviour change worth flagging.",
    score: 36,
    scoreLabel: "risk score / 100",
  },
  blocks: [
    {
      type: "kv-table",
      rows: [
        ["wallet age",         "19 months · first tx 2024-10-14"],
        ["total transactions", "4,182 · ≈ 220 / month"],
        ["gas spent",          "0.84 ETH (lifetime)"],
        ["primary activity",   "DEX swaps · LP provision · airdrops"],
        ["unique counterparties", "847 · 32 active in last 30d"],
        ["mixer interactions", { v: "none detected", chip: null }],
      ],
    },
    {
      type: "callout",
      level: "info",
      sym: "i",
      text:
        "Behaviour shifted on 2026-04-10. Pre-airdrop: passive LP. Post-airdrop: 4 large CEX deposits in 14 days. Pattern matches a planned exit.",
    },
  ],
  citations: [
    { hash: "0x55aa…ddee", agent: "scout-fetch",  what: "412 txs · 41-day window", consensus: "7/7", receipt: "https://agents.testnet.somnia.network/receipts/1646270" },
    { hash: "0x66bb…ccff", agent: "classifier",   what: "32 counterparties tagged", consensus: "6/7", receipt: "https://agents.testnet.somnia.network/receipts/1646271" },
    { hash: "0x77cc…bbaa", agent: "auditor-llm",  what: "fingerprint · 1k tokens",  consensus: "5/7", receipt: "https://agents.testnet.somnia.network/receipts/1646272" },
    { hash: "0x88dd…aabb", agent: "synthesizer",  what: "verdict · 36/100",         consensus: "6/7", receipt: "https://agents.testnet.somnia.network/receipts/1646273" },
  ],
};

window.DEMO_DATA = {
  DEMO_SESSION,
  initialMessages: [M1_USER, M2_SWARM, M3_USER, M4_SWARM_STREAMING],
  M4_SWARM_DONE,
  FOLLOWUP_RESPONSE,
  QUICKSTART_TILES,
  SLASH_COMMANDS,
  SHORT_ADDR,
};
