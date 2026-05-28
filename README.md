# {s}hinyAudit

> **a swarm. a ledger. a verdict.**
>
> Agent-native on-chain investigator built on Somnia's Agentic L1.
> Submission for **Somnia Agentathon · 2026**.

Ask the swarm anything that lives on Somnia in plain English — *"audit this contract for backdoors"*,
*"trace where the airdrop money went"*, *"profile this wallet"* — and a fleet of on-chain agents fans
out, each leaving a verifiable audit receipt on Somnia's agent platform.

---

## Live on Somnia Testnet

- **Escrow contract:** [`0xfd827d…21ea0`](https://shannon-explorer.somnia.network/address/0xfd827d464f84d6b101bd5d51cf4a0a7261221ea0)
- **Somnia agent platform:** `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776`
- **Live receipts (proof of work):**
  - scout-fetch · [receipt 1894552](https://agents.testnet.somnia.network/receipts/1894552)
  - decoder    · [receipt 1894574](https://agents.testnet.somnia.network/receipts/1894574)
  - synth      · [receipt 1894746](https://agents.testnet.somnia.network/receipts/1894746)

## The swarm

| Our agent      | Somnia base | Role                                                                  |
|----------------|-------------|-----------------------------------------------------------------------|
| `scout-fetch`  | `json-fetch`     | pulls tx history, balances, source code via Shannon Explorer       |
| `contract-decoder` | `llm-inference` (inferString) | reads verified source, flags privileged paths       |
| `flow-tracer`  | `llm-inference` (inferString) | graph-walks counterparties, detects mixer/CEX/bridge|
| `synthesizer`  | `llm-inference` (inferString) | composes the final forensic dossier in markdown     |

Every step is a real `createRequest()` to Somnia's agent platform, finalized by a 3-validator
subcommittee, with a public receipt at `agents.testnet.somnia.network/receipts/<id>`.

## Architecture

```
User (browser, wallet)
   │ ① one-time wallet popup: escrow.deposit{ value: N STT }()  ← pre-fund credit
   │
   │ ② POST /api/investigate { prompt, target, user }
   ▼
Next.js API route (SSE, runtime=nodejs, maxDuration=900s)
   │
   ▼
runInvestigation(prompt, target, user)                          ◄── lib/somnia/orchestrator.ts
   ├─ detectIntent(prompt) → audit | trace | profile | xray | watch | stealth
   ├─ planFor(intent)      → ordered [scout, decoder/tracer, synth, ...]
   └─ for each step:
       ├─ buildPayload(step, collected)  ◄── feeds previous step's output forward
       ├─ readContract escrow.credits(user)   → guard
       ├─ readContract platform.getRequestDeposit()  → reserve
       ├─ walletClient.writeContract escrow.dispatchFor(user, agentId, payload, deposit)
       │      └─ contract: drains user credit, keeps 50% as revenue, forwards deposit
       ├─ parse RequestCreated → somniaRequestId
       ├─ poll RequestFinalized event (15-min cap, 12s polling)
       ├─ getRequest(id) at finalizedBlock-1  → decode bytes via agent ABI
       └─ stream `result` event → UI

UI (components/chat/*) receives StreamEvents, maps them into rich content blocks:
  verdict tile · agent live-strip · markdown · code · risk-list · kv-table · callout · sankey · citations
```

## Local dev

```bash
npm install
cp .env.example .env       # paste your rotated PRIVATE_KEY + DEPLOYER_ADDRESS
node scripts/check-env.mjs # verify (does not print secrets)
npm run dev                # http://localhost:3000

# direct smoke test (bypasses HTTP):
node scripts/test-orchestrator.mjs 0x841b8199E6d3Db3C6f264f6C2bd8848b3cA64223 audit
```

## What's where

| Path                                  | What it is                                                              |
|---------------------------------------|-------------------------------------------------------------------------|
| `app/`                                | Next.js routes (`/`, `/chat`, `/admin`, `/api/investigate`)              |
| `app/chat/chat.css`                   | Scoped chat stylesheet (1100 lines, ported from Designv2)                |
| `components/Nav.tsx`, etc.            | Marketing landing components                                             |
| `components/chat/*`                   | 11 chat components — Chat, ChatNav, SessionStrip, AgentStrip, ...        |
| `lib/somnia/*`                        | viem chain config, agent ABIs, server signer, orchestrator               |
| `lib/chat-stream.ts`                  | SSE event → message-block adapter (browser-safe)                         |
| `lib/investigate-client.ts`           | tiny SSE reader for the browser                                          |
| `contracts/ShinyAuditEscrow.sol`      | Solidity 0.8.24 billing contract (50% service fee, refundable credit)    |
| `references/{agents,network-config,abi}.json` | Mirror of `emrestay/somnia-agents-skills` source of truth         |
| `scripts/*`                           | env check, deploy, live invoke, full pipeline smoke test                 |

## Cost per investigation

| Type     | Steps                                       | Total cost |
|----------|---------------------------------------------|------------|
| audit    | scout + decoder + synth                     | ~0.90 STT  |
| trace    | scout + tracer + synth                      | ~0.90 STT  |
| profile  | scout + profiler + synth                    | ~0.90 STT  |
| watch    | scout + synth                               | ~0.54 STT  |

50% of every per-step deposit is the platform service fee, accumulated in the escrow and
withdrawable by the owner via `/admin`.

## Tech

Next.js 15 · TypeScript strict · Tailwind 3 · viem 2 · wagmi 2 · @tanstack/react-query · Source Code Pro
(via `next/font/google`) · solc 0.8.24

---

Built for the Somnia Agentathon — independent submission, not affiliated with Somnia Network.
