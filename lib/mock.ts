// All mock data for the UI prototype. Replaced by streamed agent events
// once orchestrator goes live.

export const MOCK = {
  ticker: { investigations: 2418, contracts: 19047, spent: 84200 },

  ambientAgents: [
    { id: "scout-01",   label: "scout-01",   meta: "chain 50312", q: null },
    { id: "auditor-03", label: "auditor-03", meta: "q: 12",       q: 12 },
    { id: "tracer-07",  label: "tracer-07",  meta: "q: 4",        q: 4 },
    { id: "synth-02",   label: "synth-02",   meta: "q: 1",        q: 1 }
  ],

  ambientFeed: [
    "tx 0x9af2c4… scanned",
    "contract 0xabc91… decoded",
    "flow → 0xdef4a… mapped",
    "consensus 6/7 nodes ✓",
    "receipt 0x7f3a…d2c1 minted",
    "tx 0x1d77b… scanned",
    "wallet 0x44c9e… profiled",
    "bridge hop detected → 0xbridge…",
    "mixer signature flagged",
    "ABI fetched · 142 logs parsed",
    "owner mint trap · severity high",
    "graph walk depth 3 complete"
  ],

  quickIntents: [
    "audit contract",
    "trace funds",
    "profile wallet",
    "find rug vectors",
    "decode unknown tx",
    "monitor address"
  ],

  agents: [
    {
      id: "scout-fetch",
      name: "scout-fetch",
      tool: "somnia json-fetch",
      desc: "pulls tx history, balances",
      sub: "via blockscout api",
      cost: 0.42,
      eta: 4,
      log: [
        "GET /api?module=account&action=txlist",
        "203 tx · 14 internal · paged ✓",
        "balances resolved · 7 tokens",
        "eth_call 0x70a08231 → 0x00…1f4"
      ]
    },
    {
      id: "contract-decoder",
      name: "contract-decoder",
      tool: "somnia llm-inference",
      desc: "disassembles bytecode + abi",
      sub: "reads source if verified",
      cost: 0.81,
      eta: 9,
      log: [
        "fetched bytecode · 12,304 bytes",
        "ABI verified · 41 functions",
        "storage slot scan · 18 slots read",
        "flagged: owner-only mint, no timelock"
      ]
    },
    {
      id: "flow-tracer",
      name: "flow-tracer",
      tool: "somnia llm-tools",
      desc: "graph walks counterparties",
      sub: "up to 3 hops",
      cost: 1.20,
      eta: 14,
      log: [
        "depth 1 · 41 edges traversed",
        "depth 2 · 188 edges · 22 wallets",
        "depth 3 · mixer signature found",
        "consensus 5/7 nodes ✓"
      ]
    },
    {
      id: "synthesizer",
      name: "synthesizer",
      tool: "somnia llm-inference",
      desc: "composes the dossier",
      sub: "verifies citations",
      cost: 0.68,
      eta: 6,
      log: [
        "tokens in · 24,118",
        "consensus 6/7 nodes ✓",
        "citations resolved · 14",
        "dossier emitted · 4.2 kb"
      ]
    }
  ],

  capabilities: [
    { title: "contract forensics",      body: "reads source, bytecode, storage slots — flags backdoors, infinite mints, ownership traps.", example: "audit 0xabc…",                glyph: "contract" },
    { title: "fund-flow tracing",       body: "graph-walks counterparties up to N hops. detects mixers, bridges, atomic splits.",          example: "where did the airdrop go?", glyph: "flow" },
    { title: "stealth-launch detection",body: "finds projects building quietly — deployer wallets, factory contracts, pre-announcement activity.", example: "what is @project building?", glyph: "stealth" },
    { title: "wallet profiling",        body: "behavioral fingerprint, counterparty graph, risk score, mev / sybil hints.",                example: "profile 0xdef…",            glyph: "wallet" },
    { title: "token & nft x-ray",       body: "supply, holders, concentration, mint history, royalty traps, hidden permissions.",          example: "x-ray token X",             glyph: "xray" },
    { title: "continuous watch",        body: "tell the swarm to keep watching. on-chain ping when something changes.",                    example: "alert me if owner renounces", glyph: "watch" }
  ],

  dossier: {
    id: "002418",
    prompt: "follow funds from 0xdrop… and flag mixers",
    dispatched: "2026-05-24 11:42 utc",
    duration: 38,
    nodes: 7,
    agents: 4,
    cost: 4.66,
    summary: [
      "primary recipient (0xdrop…) split funds across 12 sybil wallets within 47 seconds.",
      "78.4% of value reached mixer signature (tornado-like cluster) at hop 2.",
      "deployer wallet linked to 3 prior rugs by transaction-pattern fingerprint."
    ],
    timeline: [
      { ts: "11:42:01", text: "intent received · target 0xdrop… resolved",        kind: "user"   },
      { ts: "11:42:03", text: "scout-fetch dispatched · 203 tx fetched",          kind: "system" },
      { ts: "11:42:07", text: "flow-tracer hop 1 · 12 receivers identified",      kind: "system" },
      { ts: "11:42:12", text: "flow-tracer hop 2 · mixer cluster detected",       kind: "flag"   },
      { ts: "11:42:18", text: "contract-decoder · backdoor `_emergencyMint` found", kind: "flag" },
      { ts: "11:42:31", text: "synthesizer · consensus 6/7 · dossier emitted",    kind: "system" },
      { ts: "11:42:39", text: "dossier sealed · receipt 0x7f3a…d2c1",             kind: "user"   }
    ],
    flagged: [
      { sev: "high" as const, title: "owner-only mint, no timelock",   body: "deployer retains unconstrained `_emergencyMint` after renounce signal.", ref: "tx 0xa1f…7c2" },
      { sev: "med"  as const, title: "mixer interaction at hop 2",     body: "78.4% of value routed through known privacy cluster within 4 blocks.",   ref: "tx 0x991…b04" },
      { sev: "low"  as const, title: "sybil split pattern",            body: "12 receivers funded in <60s; common txnonce signature.",                  ref: "tx 0x331…fee" }
    ],
    citations: [
      { id: "0x7f3a…d2c1", tag: "synth · consensus 6/7" },
      { id: "0x1d77…b04",  tag: "flow-tracer · hop 2" },
      { id: "0xabc9…1f4",  tag: "contract-decoder · slot 7" },
      { id: "0x44c9…e8a",  tag: "scout-fetch · txlist" }
    ]
  }
} as const;

export type MockAgent = (typeof MOCK.agents)[number];
export type MockCapability = (typeof MOCK.capabilities)[number];
