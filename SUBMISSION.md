ShinyAudit — Agentic On-Chain Investigator on Somnia
=====================================================

A swarm. A ledger. A verdict.


LINKS
-----

Live app          https://shinyaudit.vercel.app
Chat              https://shinyaudit.vercel.app/chat
Source code       https://github.com/pSJLq/ShinyAudit
MCP endpoint      https://shinyaudit.vercel.app/api/mcp
Network           Somnia Shannon testnet (chain id 50312)
Escrow contract   0xfd827d464f84d6b101bd5d51cf4a0a7261221ea0
Agent platform    0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776


WHAT IT IS
----------

ShinyAudit turns any on-chain question into an autonomous investigation. You
ask in plain language — in any language — and a swarm of agents running on
Somnia's Agentic L1 plans the work, reads the ledger through real on-chain
agent calls, reasons over the results across multiple rounds, and returns a
verifiable verdict with citations and sealed receipts.

It is not a dashboard that shows data. It is an investigator that answers
questions.

Questions it handles today:

  - "Audit this casino contract for backdoors, bugs, and rug vectors."
  - "Who owns this contract?" — resolves the on-chain owner and their
    off-chain identity (OpenSea, X/Twitter, ENS, Lens, Farcaster).
  - "Is this token a honeypot — can I actually sell it?"
  - "Where did the treasury funds go?"
  - "What does this UNVERIFIED contract do?" — recovers its callable ABI
    straight from bytecode.
  - "Which projects are building quietly this week?"
  - "Are these two wallets the same person?"


WHY IT'S DIFFERENT
------------------

1. 100% on-chain and agentic, with no off-chain shortcuts.

   Every tool call is a real createRequest() to Somnia's agent platform,
   finalized by a validator subcommittee, with a public receipt at
   agents.testnet.somnia.network/receipts/<id>. Nothing is faked off-chain.

   Two execution modes ship:

   - Orchestrator-managed loop — observable step by step in the UI: plan,
     dispatch tools, reason, synthesize. Each step is a visible on-chain
     transaction.

   - Somnia-native mode (/api/investigate-native) — a single inferToolsChat
     dispatch where the on-chain LLM agent self-directs the whole
     investigation: it picks tools from our MCP catalogue, dispatches them
     on-chain, reasons, and iterates. One receipt covers the entire run. This
     is the purest expression of Somnia's agentic L1.

2. Adaptive, not scripted.

   164 composable on-chain tools, anchored by universal primitives so the
   agent can tackle questions nobody pre-programmed:

   - view_call reads any view or pure function of any contract by signature
     (getReserves(), balanceOf(address), cliff(), and so on). No ABI needed;
     the result is decoded heuristically.

   - discover finds things by criterion rather than by address: newest and
     trending verified contracts, top tokens by holders, full-text name
     search.

   - resolve maps a name to an address (ENS plus on-chain search), so users
     can name a target by word instead of pasting hex.

   The planner runs on principles, not fixed playbooks: a universal core
   toolset is always available, deep multi-hop reasoning up to six rounds with
   a no-progress detector and an STT budget cap, and orchestrator-level rails
   that guarantee critical lenses (identity, owner) are checked when relevant.

3. It reverse-engineers the opaque.

   Even with no verified source, ShinyAudit can:

   - selectors — disassemble bytecode, extract PUSH4 function selectors,
     resolve them via 4byte, and recover the contract's callable ABI.

   - bytecode_scan — static opcode analysis (DELEGATECALL, SELFDESTRUCT,
     CREATE, CALL, SSTORE counts) that flags proxy, factory, and destructible
     patterns. It is honest by design: it strips compiler metadata and treats
     a single ambiguous opcode as low-confidence rather than crying wolf.

   - storage — read raw storage slots (including EIP-1967 implementation and
     admin slots), exposing hidden state on unverified contracts.

   - classify — identify contract type via ERC-165 interface probing
     (ERC20, ERC721, ERC1155, AMM, multisig, proxy).

4. It is verifiable and monetized.

   A custom escrow contract (contracts/ShinyAuditEscrow.sol) lets users
   pre-fund credit once. The orchestrator signs agent dispatches on their
   behalf, forwards the agent deposit to the platform, and retains a service
   fee. The UX is one click, per-question cost is shown up front, and the
   owner can withdraw accrued revenue.


CAPABILITY SURFACE (164 TOOLS)
------------------------------

Contract audit
  Bounded source read, category classifier, owner and admin resolver, proxy
  and upgrade analysis, a 12-point universal checklist plus 11 category-
  specific checklists.

Identity
  Aggregates OpenSea, X/Twitter, ENS, Lens, Farcaster, Mirror, and Galxe into
  one deterministic answer.

Forensics
  Fund-flow tracing, funding-trail de-anonymization, address linkage ("are
  these the same person?"), and behavioural archetypes (bot, whale, deployer,
  hub).

Token safety
  Honeypot and rug detection, distribution and whale analysis (Nakamoto
  coefficient), and an approval scanner.

Reverse-engineering
  Bytecode-to-ABI recovery, opcode danger scan, raw storage reads, and
  clone/fork detection.

Discovery
  Trending and fresh contracts, top tokens, full-text search.

Interoperability
  A full Model Context Protocol server — any LLM client (Claude Desktop and
  others) can drive ShinyAudit's on-chain tools directly.


ARCHITECTURE
------------

  User (browser, wallet, any language)
    1. escrow.deposit() once, to pre-fund STT credit
    2. POST /api/investigate { prompt, target, user }  (server-sent events)
         |
         v
  Orchestrator (Next.js API, server-signed)
    - detectIntent(prompt): audit | trace | profile | xray | watch | stealth | free
    - pre-flight rails: snapshot + owner + identity on the target (on-chain)
    - reasoning loop, up to 6 rounds:
        - planner LLM produces a structured plan and tool calls
        - each tool: escrow.dispatchFor() -> platform.createRequest()
              -> validator subcommittee finalizes -> sealed receipt
              -> result fetched via the receipts API (consensus-independent)
        - identity probes auto-injected on newly surfaced addresses
        - synthesizer LLM writes a verdict-first report with citations
         |
         v
  UI renders the streamed events: pipeline graph, agent strip, verdict card,
  formatted report, and receipt links.

A note on speed without compromise: heavy data tools (snapshot, identity,
honeypot, selectors, and so on) are server-side aggregators that pre-digest
four to eight upstream sources into a single compact summary field. The
on-chain agent retrieves that one small field, so validator consensus is fast,
but the dispatch itself is unconditionally on-chain with a real receipt. This
is how investigations finish in under a minute without sacrificing the
agentic, on-chain principle.


TECH STACK
----------

Next.js 15 (App Router), TypeScript (strict mode), viem 2 and wagmi 2, a
Solidity escrow contract deployed on Somnia testnet, server-sent-events
streaming, and a Markdown renderer for reports. Deployed on Vercel with
auto-deploy from GitHub.


ON-CHAIN PROOF
--------------

Escrow contract
  https://shannon-explorer.somnia.network/address/0xfd827d464f84d6b101bd5d51cf4a0a7261221ea0

Somnia agent platform
  0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776

Receipts
  agents.testnet.somnia.network/receipts/<id> — generated live on every
  investigation; each tool call and each LLM step leaves one.


HOW TO TRY IT
-------------

  1. Open https://shinyaudit.vercel.app/chat
  2. Connect a wallet on Somnia Shannon testnet (chain 50312).
  3. Deposit a small amount of STT as credit (one click).
  4. Ask anything — for example, "audit 0x... for rug vectors" or
     "who owns 0x..." — in any language. Watch the swarm dispatch on-chain
     agents and return a verdict with verifiable receipts.

Developers can also point any MCP client at
https://shinyaudit.vercel.app/api/mcp to call the 164 on-chain tools directly.
