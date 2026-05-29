/**
 * Orchestrator — server-only. End-to-end agent-native investigation flow.
 *
 *   1. plan        — pick agent sequence from user intent (heuristic)
 *   2. dispatchFor — escrow.dispatchFor(user, …) per step:
 *                       → forwards agentDeposit to Somnia platform
 *                       → withholds 50% service fee
 *                       → returns somniaRequestId
 *   3. waitFinal   — poll RequestFinalized event on Somnia platform
 *   4. decode      — read getRequest at (finalizedBlock - 1), decode result
 *   5. chain       — feed previous step's decoded result into next step's prompt
 *   6. synth       — final llm-inference compose dossier markdown
 *
 * Every invocation is a real on-chain transaction. No off-chain shortcuts.
 */

import "server-only";
import {
  decodeEventLog,
  decodeFunctionResult,
  formatEther,
  parseAbiItem,
  parseEther,
  type AbiFunction,
  type Hex
} from "viem";

import { publicClient, getOrchestratorWallet } from "./server";
import {
  ACTIVE_NETWORK,
  AGENT_EXPLORER_URL,
  EXPLORER_API,
  PLATFORM_ADDRESS,
  RECEIPTS_BASE_URL
} from "./chains";
import {
  AGENT_SLUG,
  AGENTS,
  PLATFORM_ABI,
  encodeExtractString,
  encodeInferString,
  encodeInferToolsChat,
  encodeJsonFetchString,
  encodeJsonFetchUint,
  getAgentAbi,
  getAgentId,
  type AgentSlug
} from "./agents";
import { ESCROW_ABI, ESCROW_ADDRESS, quoteEscrow } from "./escrow";
import { TOOLS, TOOL_BY_NAME, renderToolsCatalogueFor, type ToolSpec, type BuiltTool } from "./tools";

// ---------- types ----------

export type Severity = "high" | "med" | "low";

export interface PlanStep {
  id: string;
  slug: AgentSlug;
  fnName: string;
  description: string;
  estimateSTT: number;
}

export interface Flagged {
  severity: Severity;
  title: string;
  body: string;
  ref?: string;
}

export interface Citation {
  id: string;
  tag: string;
  url: string;
}

interface PublicAgentStep {
  id: string;
  slug: AgentSlug;
  fnName: string;
  description: string;
  costEstimateSTT: number;
}

export type StreamEvent =
  | { type: "quote";      agents: number; service: number; total: number }
  | { type: "plan";       steps: PublicAgentStep[] }
  | { type: "started";    stepId: string; slug: AgentSlug; fnName: string }
  | { type: "log";        stepId: string; line: string }
  | { type: "txhash";     stepId: string; hash: Hex }
  | { type: "request";    stepId: string; requestId: string; deposit: string; receiptUrl: string }
  | { type: "finalized";  stepId: string; status: ResponseStatus; finalizedBlock: string }
  | { type: "result";     stepId: string; output: string }
  | { type: "dossier";    markdown: string; flagged: Flagged[]; citations: Citation[]; cost: string }
  | { type: "error";      stepId?: string; message: string }
  | { type: "done" };

// ---------- planner ----------

const PRICES: Record<AgentSlug, number> = {
  "json-fetch":        0.03,
  "llm-inference":     0.07,
  "llm-parse-website": 0.10
};
const SUBCOMMITTEE_SIZE = 3;
const RESERVE_ESTIMATE = 0.03; // approximation of getRequestDeposit()
const ESTIMATE = (slug: AgentSlug) => (PRICES[slug] * SUBCOMMITTEE_SIZE + RESERVE_ESTIMATE) * 1.5;

export function detectIntent(prompt: string): "audit" | "trace" | "profile" | "xray" | "watch" | "stealth" | "free" {
  const p = prompt.toLowerCase();
  // Multilingual (en + ru) keyword matchers. Free-form questions always go
  // through the agent loop anyway, so misclassification is recoverable.
  if (p.startsWith("/audit")   || /(audit|аудит|backdoor|бэкдор|rug|раг|privileged|exploit|уязвимост|опасн)/.test(p)) return "audit";
  if (p.startsWith("/trace")   || /(trace|trac|airdrop|дроп|drop|mixer|миксер|hop|bridge|cex|sold|sell|продал|перевёл|перевел|вывел|куда|вывод|where did|follow.*fund)/.test(p)) return "trace";
  // "владелец/создатель/основатель/ник/handle/username" — every form of
  // "who is behind this" routes to profile so the identity playbook runs.
  if (p.startsWith("/profile") || /(profile|профил|fingerprint|behaviour|поведен|counterparties|чем занимается|что делает|owner|owner.*wallet|чей|чьё|чья|владел|собственник|создатель|основател|кто.*созда|кто.*деплои|кто.*стоит|ник\b|никнейм|username|handle|whose|who (is|owns|made|created|deployed))/.test(p)) return "profile";
  if (p.startsWith("/xray")    || /(x-?ray|рентген|holders|держател|concentration|supply|эмисси|токен анализ)/.test(p)) return "xray";
  if (p.startsWith("/watch")   || /(watch|следи|notify|alert|оповест|монитор|monitor)/.test(p)) return "watch";
  if (p.startsWith("/stealth") || /(stealth|стелс|hidden deploy|скрыт|deployer|деплоер|что строит|new launch)/.test(p)) return "stealth";
  return "free";
}

/**
 * Decides whether to use the legacy fixed pipeline or the new dynamic
 * agent loop.
 *
 * Audit ALWAYS uses the loop — a 1-shot pipeline is too shallow for any
 * non-trivial contract (especially DeFi/casino/gambling where storage
 * inspection + admin-tx analysis matters as much as source reading).
 */
export function useAgentLoop(prompt: string, intent: ReturnType<typeof detectIntent>): boolean {
  if (intent === "free" || intent === "audit") return true;
  const tail = prompt
    .replace(/^\/(trace|profile|xray|watch|stealth)\s+/i, "")
    .replace(/0x[a-fA-F0-9]{40,64}/g, "")
    .replace(/[.,;:!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return tail.length > 3;
}

// Multi-scout fan-out: for intents where one fetchString isn't enough, we
// expand `scout` into N pinpoint fetchString calls (each pulls one scalar
// field — a hash, an address, a value). Each is its own on-chain agent
// invocation with its own receipt, but the UI groups them under "scout".
// Pull 10 recent txs (offset=10) into multiple scalar fetches. Each scout uses
// the SAME wide-window URL (offset=10) — only the selector path differs. That
// means validators see identical HTTP responses on every call and only the
// selector picks a different scalar slice → deterministic consensus.
const MULTI_SCOUT: Record<string, ScoutField[]> = {
  profile: [
    // balance: fetchUint with decimals=0 returns raw wei as uint256.
    // fetchUint is more consensus-friendly than fetchString — every validator
    // ABI-encodes the same uint256, no string formatting drift.
    { id: "scout.balance",      selector: "result",              urlKind: "balance", fn: "fetchUint", decimals: 0 },
    { id: "scout.txcount",      selector: "result.length",       urlKind: "txlist", offset: 10, fn: "fetchUint", decimals: 0 },
    { id: "scout.tx0.hash",     selector: "result.0.hash",       urlKind: "txlist", offset: 10 },
    { id: "scout.tx0.to",       selector: "result.0.to",         urlKind: "txlist", offset: 10 },
    { id: "scout.tx0.val",      selector: "result.0.value",      urlKind: "txlist", offset: 10 },
    { id: "scout.tx0.method",   selector: "result.0.methodId",   urlKind: "txlist", offset: 10 },
    { id: "scout.tx1.to",       selector: "result.1.to",         urlKind: "txlist", offset: 10 },
    { id: "scout.tx1.val",      selector: "result.1.value",      urlKind: "txlist", offset: 10 },
    { id: "scout.tx2.to",       selector: "result.2.to",         urlKind: "txlist", offset: 10 },
    { id: "scout.tx3.to",       selector: "result.3.to",         urlKind: "txlist", offset: 10 },
    { id: "scout.tx5.to",       selector: "result.5.to",         urlKind: "txlist", offset: 10 }
  ],
  trace: [
    { id: "scout.tx0.hash",     selector: "result.0.hash",       urlKind: "txlist", offset: 10 },
    { id: "scout.tx0.to",       selector: "result.0.to",         urlKind: "txlist", offset: 10 },
    { id: "scout.tx0.val",      selector: "result.0.value",      urlKind: "txlist", offset: 10 },
    { id: "scout.tx1.to",       selector: "result.1.to",         urlKind: "txlist", offset: 10 },
    { id: "scout.tx1.val",      selector: "result.1.value",      urlKind: "txlist", offset: 10 },
    { id: "scout.tx2.to",       selector: "result.2.to",         urlKind: "txlist", offset: 10 },
    { id: "scout.tx2.val",      selector: "result.2.value",      urlKind: "txlist", offset: 10 },
    { id: "scout.tx5.to",       selector: "result.5.to",         urlKind: "txlist", offset: 10 }
  ],
  stealth: [
    { id: "scout.int0.cont",    selector: "result.0.contractAddress", urlKind: "txlistinternal", offset: 10 },
    { id: "scout.int1.cont",    selector: "result.1.contractAddress", urlKind: "txlistinternal", offset: 10 },
    { id: "scout.int2.cont",    selector: "result.2.contractAddress", urlKind: "txlistinternal", offset: 10 },
    { id: "scout.int3.cont",    selector: "result.3.contractAddress", urlKind: "txlistinternal", offset: 10 }
  ]
};

interface ScoutField {
  id: string;
  selector: string;
  urlKind: "txlist" | "txlistinternal" | "balance" | "getsourcecode" | "getToken";
  offset?: number;
  fn?: "fetchString" | "fetchUint";
  decimals?: number;
}

function scoutUrl(target: string, kind: ScoutField["urlKind"], offset = 1): string {
  switch (kind) {
    case "balance":
      return `${EXPLORER_API}?module=account&action=balance&address=${target}`;
    case "txlist":
      return `${EXPLORER_API}?module=account&action=txlist&address=${target}&page=1&offset=${offset}&sort=desc`;
    case "txlistinternal":
      return `${EXPLORER_API}?module=account&action=txlistinternal&address=${target}&page=1&offset=${offset}&sort=desc`;
    case "getsourcecode":
      return `${EXPLORER_API}?module=contract&action=getsourcecode&address=${target}`;
    case "getToken":
      return `${EXPLORER_API}?module=token&action=getToken&contractaddress=${target}`;
  }
}

export function planFor(intent: ReturnType<typeof detectIntent>): PlanStep[] {
  // Expand scout into multi-fetch fan-out for intents that need rich data.
  const expandScout = (analyzerId: string, analyzerDesc: string): PlanStep[] => {
    const fields = MULTI_SCOUT[intent] || [];
    const scouts: PlanStep[] = fields.map((f) => ({
      id: f.id,
      slug: AGENT_SLUG.JSON_FETCH,
      fnName: f.fn || "fetchString",
      description: `fetch ${f.selector.replace("result.", "")}`,
      estimateSTT: ESTIMATE("json-fetch")
    }));
    return [
      ...scouts,
      { id: analyzerId, slug: AGENT_SLUG.LLM_INFERENCE, fnName: "inferString", description: analyzerDesc, estimateSTT: ESTIMATE("llm-inference") },
      { id: "synth",    slug: AGENT_SLUG.LLM_INFERENCE, fnName: "inferString", description: "compose dossier from findings",                       estimateSTT: ESTIMATE("llm-inference") }
    ];
  };

  switch (intent) {
    case "audit":
      return [
        { id: "scout",   slug: AGENT_SLUG.JSON_FETCH,    fnName: "fetchString",  description: "fetch verified source from Shannon explorer",        estimateSTT: ESTIMATE("json-fetch") },
        { id: "decoder", slug: AGENT_SLUG.LLM_INFERENCE, fnName: "inferString",  description: "audit source — owner privileges, hidden mints",      estimateSTT: ESTIMATE("llm-inference") },
        { id: "synth",   slug: AGENT_SLUG.LLM_INFERENCE, fnName: "inferString",  description: "compose forensic dossier from findings",              estimateSTT: ESTIMATE("llm-inference") }
      ];
    case "trace":
      return expandScout("tracer",  "trace counterparties, flag mixers/CEX/bridges");
    case "profile":
      return expandScout("profiler","behavioural fingerprint, risk score, counterparty mix");
    case "stealth":
      return expandScout("stealth", "summarise stealth deployments");
    case "xray":
      return [
        { id: "scout",   slug: AGENT_SLUG.JSON_FETCH,    fnName: "fetchString",  description: "pull token info (supply, holders, source)",           estimateSTT: ESTIMATE("json-fetch") },
        { id: "xray",    slug: AGENT_SLUG.LLM_INFERENCE, fnName: "inferString",  description: "x-ray supply, permissions, royalty config",           estimateSTT: ESTIMATE("llm-inference") },
        { id: "synth",   slug: AGENT_SLUG.LLM_INFERENCE, fnName: "inferString",  description: "compose token x-ray dossier",                         estimateSTT: ESTIMATE("llm-inference") }
      ];
    case "watch":
      return [
        { id: "scout",   slug: AGENT_SLUG.JSON_FETCH,    fnName: "fetchString",  description: "snapshot current contract state",                     estimateSTT: ESTIMATE("json-fetch") },
        { id: "synth",   slug: AGENT_SLUG.LLM_INFERENCE, fnName: "inferString",  description: "build watch terms + threshold spec",                  estimateSTT: ESTIMATE("llm-inference") }
      ];
    default:
      return [
        { id: "scout",   slug: AGENT_SLUG.JSON_FETCH,    fnName: "fetchString",  description: "fetch on-chain context for free-form interpretation", estimateSTT: ESTIMATE("json-fetch") },
        { id: "synth",   slug: AGENT_SLUG.LLM_INFERENCE, fnName: "inferString",  description: "interpret request and respond",                       estimateSTT: ESTIMATE("llm-inference") }
      ];
  }
}

export function priceQuote(plan: PlanStep[]): { agents: number; service: number; total: number } {
  const agents = plan.reduce((s, x) => s + x.estimateSTT, 0) / 1.5; // strip service multiplier
  const service = agents * 0.5;
  return { agents, service, total: agents + service };
}

// ---------- dispatch ----------

const FINALIZED_EVENT = parseAbiItem("event RequestFinalized(uint256 indexed requestId, uint8 status)");
const MAX_LOG_RANGE = 1000n;
const RESPONSE_STATUS = ["None", "Pending", "Success", "Failed", "TimedOut"] as const;
type ResponseStatus = (typeof RESPONSE_STATUS)[number];

function shortAddr(s: string): string {
  if (!s || s.length < 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

interface BuildCtx {
  target: string;
  prompt: string;
  intent: ReturnType<typeof detectIntent>;
  collected: Record<string, string>;
}

/** Build the payload for a step using upstream results in `ctx.collected`. */
function buildStepPayload(step: PlanStep, ctx: BuildCtx): Hex {
  if (step.slug === AGENT_SLUG.JSON_FETCH) {
    // scout step — URL + selector depend on intent.
    //
    // CRITICAL: json-fetch.fetchString requires the selector to point at a
    // SCALAR string. If the selector lands on an object or array, each
    // validator may serialise it differently → on-chain consensus fails.
    const { target, intent } = ctx;

    // Multi-scout case: step.id matches one of MULTI_SCOUT[intent] fields.
    const multiFields = MULTI_SCOUT[intent];
    if (multiFields) {
      const field = multiFields.find((f) => f.id === step.id);
      if (field) {
        const url = scoutUrl(target, field.urlKind, field.offset ?? 1);
        if (field.fn === "fetchUint") {
          return encodeJsonFetchUint(url, field.selector, field.decimals ?? 0);
        }
        return encodeJsonFetchString(url, field.selector);
      }
    }

    // Single-scout case: legacy hard-coded selectors for audit/xray/watch/free.
    let url: string;
    let selector: string;
    switch (intent) {
      case "audit": {
        url = scoutUrl(target, "getsourcecode");
        selector = "result.0.SourceCode";
        break;
      }
      case "xray": {
        url = scoutUrl(target, "getToken");
        selector = "result.name";
        break;
      }
      case "watch": {
        url = scoutUrl(target, "txlist", 1);
        selector = "result.0.hash";
        break;
      }
      case "free":
      default: {
        url = scoutUrl(target, "getsourcecode");
        selector = "result.0.Address";
        break;
      }
    }
    return encodeJsonFetchString(url, selector);
  }

  // llm-inference step
  const sys = systemPrompt(step.id, ctx.intent);
  const ctxBlob = renderContextBlob(step.id, ctx);
  const prompt = `User intent: ${ctx.prompt}\nTarget: ${ctx.target}\n\nUpstream context:\n${ctxBlob}`;
  return encodeInferString({
    prompt: prompt.slice(0, 3500), // protect against very long prompts
    system: sys,
    chainOfThought: true
  });
}

function systemPrompt(stepId: string, intent: ReturnType<typeof detectIntent>): string {
  // STRICT no-hallucination preamble — applied to every step. LLM consensus on
  // Somnia is non-deterministic enough already; we MUST forbid the model from
  // inventing data, addresses, protocol names or tx hashes that aren't in the
  // upstream context.
  const NO_HALLUCINATION = [
    "CRITICAL RULES — violation makes this output worthless:",
    "1. You are running on the SOMNIA TESTNET (chain id 50312). Do NOT mention",
    "   Uniswap, Aave, Curve, Lido, OpenSea, Binance, or any other protocol",
    "   unless its address appears verbatim in the upstream context below.",
    "2. Do NOT invent transaction hashes, contract names, counterparty labels,",
    "   token symbols, USD amounts, or activity timelines that are not in the",
    "   upstream context. Echo only what is given.",
    "3. If the upstream context is empty or contains only a single value, your",
    "   response MUST say 'insufficient on-chain data — only N field(s) available'",
    "   and set findings to [] / counterparties to [].",
    "4. Never guess. Never roleplay. Never fill in plausible-looking data.",
    "5. Quote exact strings from the upstream block. Use backticks for any",
    "   address or hash you cite, and only addresses/hashes that LITERALLY",
    "   appear above."
  ].join("\n");

  switch (stepId) {
    case "decoder":
      return [
        NO_HALLUCINATION,
        "",
        "ROLE: Solidity security auditor.",
        "TASK: Read the contract source in 'Upstream context'.",
        "If source is present, identify privileged functions, hidden mints, and ownership traps.",
        "Return ONLY strict JSON — no markdown, no commentary:",
        '{"verdict":"<one sentence based ONLY on the source>","severity":"high|med|low|none","risk_score":<0-100>,"findings":[{"sev":"high|med|low","title":"<exact function/pattern from source>","desc":"<why, citing line if visible>","fn":"<function signature from source>"}]}',
        "If source is empty/missing, return {\"verdict\":\"contract not verified on Shannon Explorer — source unavailable\",\"severity\":\"none\",\"risk_score\":0,\"findings\":[]}."
      ].join("\n");
    case "tracer":
      return [
        NO_HALLUCINATION,
        "",
        "ROLE: blockchain forensic tracer (Somnia testnet).",
        "TASK: From the upstream tx data, list ONLY the counterparties and amounts that are literally present.",
        "Do NOT classify a counterparty as CEX/bridge/DEX unless you can match its address to a known label in the upstream text.",
        "Return JSON: {\"verdict\":\"<one sentence from what you have>\",\"summary\":\"<paragraph or 'insufficient data'>\",\"flagged\":[{\"severity\":\"high|med|low\",\"title\":\"...\",\"body\":\"...\"}],\"hops\":[{\"to\":\"<EXACT 0x address from upstream>\",\"tag\":\"unknown|EOA|contract\",\"amount\":\"<exact value or null>\"}]}"
      ].join("\n");
    case "profiler":
      return [
        NO_HALLUCINATION,
        "",
        "ROLE: wallet behavioural analyst (Somnia testnet).",
        "TASK: Describe activity only as inferred from upstream tx records.",
        "Do NOT invent protocols. Do NOT invent counterparty classifications.",
        "Return JSON: {\"verdict\":\"<one sentence grounded in data>\",\"fingerprint\":\"<observed pattern or 'insufficient data'>\",\"risk_score\":<0-100, conservative — default 50 when uncertain>,\"counterparties\":[{\"addr\":\"<exact 0x address>\",\"class\":\"unknown|EOA|contract\"}],\"flags\":[{\"severity\":\"high|med|low\",\"title\":\"...\",\"body\":\"...\"}]}"
      ].join("\n");
    case "xray":
      return [
        NO_HALLUCINATION,
        "",
        "ROLE: token x-ray analyst (Somnia testnet).",
        "TASK: Surface only what is present in the upstream token data.",
        "Return JSON: {\"verdict\":\"...\",\"supply\":\"<exact or null>\",\"top_concentration_pct\":<0-100 or null>,\"flags\":[...]}"
      ].join("\n");
    case "stealth":
      return [
        NO_HALLUCINATION,
        "",
        "ROLE: stealth-launch hunter.",
        "TASK: From the upstream tx list, identify contract-creation transactions that literally appear.",
        "Return JSON: {\"verdict\":\"...\",\"deployments\":[{\"addr\":\"<exact 0x>\",\"kind\":\"unknown|factory|token\",\"note\":\"...\"}]}"
      ].join("\n");
    case "synth": {
      const intentLine =
        intent === "audit"   ? "This is a contract-audit dossier." :
        intent === "trace"   ? "This is a fund-flow trace dossier." :
        intent === "profile" ? "This is a wallet-profile dossier." :
        intent === "xray"    ? "This is a token-x-ray dossier." :
        intent === "watch"   ? "This is a watch-setup dossier." :
        intent === "stealth" ? "This is a stealth-launch dossier." :
                                "This is a free-form interpretation dossier.";
      return [
        NO_HALLUCINATION,
        "",
        `ROLE: synthesizer for {s}hinyAudit. ${intentLine}`,
        "TASK: Compose a forensic dossier in PROPER MARKDOWN with REAL NEWLINES.",
        "",
        "FORMAT — strict:",
        "Line 1: **Verdict:** <one bold sentence based ONLY on upstream data>",
        "Blank line.",
        "If upstream is thin (e.g. only a balance + 1 tx), include this line literally:",
        "  > ⚠ limited on-chain data — verdict is preliminary",
        "Blank line.",
        "## Summary",
        "<3-5 bullet points, each starting with `- `, on its OWN line, separated by `\\n`. Don't run them inline.>",
        "Blank line.",
        "## Findings",
        "<3-6 bullets, each on its own line. Cite exact addresses/hashes from upstream with backticks.>",
        "Blank line.",
        "## Counterparties (only if intent is profile/trace, only addresses literally present)",
        "<bullet list of `0x...` addresses, one per line, no protocol guessing>",
        "Blank line.",
        "## Citations",
        "<bullet list of every on-chain receipt id and tx hash literally present in upstream>",
        "",
        "ABSOLUTE rules:",
        "- USE REAL NEWLINES between bullets — do NOT collapse them into one line.",
        "- Numbers like balance: format with thousand separators (8,032,803,499,571,699,260 wei = ~8.03 STT).",
        "- If you see hex methodId (e.g. 0x62e32e87), say 'function selector 0x62e32e87 (purpose unknown without ABI)'.",
        "- Do NOT mention Uniswap/Aave/Binance/CEX/DEX/MEV/sybil unless the upstream contains a label that says so verbatim.",
        "- If wallet has ≥5 distinct counterparties, mention it; if ≤2, say 'narrow counterparty set'."
      ].join("\n");
    }
    default:
      return [
        NO_HALLUCINATION,
        "",
        "ROLE: on-chain investigator. Respond with concise markdown grounded ONLY in the upstream context."
      ].join("\n");
  }
}

function renderContextBlob(stepId: string, ctx: BuildCtx): string {
  if (stepId === "synth") {
    // for synthesizer, pass everything (analyzer JSON + raw scout fields)
    const entries: string[] = [];
    for (const [k, v] of Object.entries(ctx.collected)) {
      if (!v) continue;
      const cap = k === "scout" ? 4000 : 2000;
      entries.push(`## ${k}\n${v.slice(0, cap)}`);
    }
    return entries.join("\n\n");
  }
  // For analyzer steps, gather all scout outputs into a structured block.
  // Multi-scout collects keys like scout.tx0.hash, scout.tx0.to, etc.
  const scoutEntries = Object.entries(ctx.collected).filter(([k]) => k.startsWith("scout"));
  if (scoutEntries.length === 0) return "(no upstream data yet)";

  if (scoutEntries.length === 1 && scoutEntries[0][0] === "scout") {
    // single-scout (audit) — full source
    return `scout-fetch output:\n${scoutEntries[0][1].slice(0, 8000)}`;
  }

  // multi-scout — render as labelled scalar key/value pairs.
  // Also surface failed/empty fetches explicitly so the LLM doesn't silently
  // assume the wallet is dormant when actually some validator just disagreed.
  const lines: string[] = [
    `=== Live on-chain data fetched from Shannon Explorer ===`,
    `(target: ${ctx.target}, intent: ${ctx.intent})`,
    ""
  ];
  const allExpected = MULTI_SCOUT[ctx.intent] || [];
  for (const f of allExpected) {
    const got = ctx.collected[f.id];
    const label = f.id.replace(/^scout\./, "");
    if (got && got.trim() && got !== "0" && got !== "" && got !== "0x") {
      lines.push(`${label} = ${got}`);
    } else if (got === "0" || got === "") {
      lines.push(`${label} = ${got || "(empty)"}  // present but zero/empty`);
    } else {
      lines.push(`${label} = (validator consensus failed — value unavailable)`);
    }
  }
  // also include any extra collected entries that weren't in the expected list
  for (const [k, v] of scoutEntries) {
    if (allExpected.find((f) => f.id === k)) continue;
    lines.push(`${k.replace(/^scout\./, "")} = ${v}`);
  }
  lines.push("");
  lines.push("=== End of upstream data ===");
  lines.push("");
  lines.push("Interpretation rules:");
  lines.push("- balance is in wei (1 STT = 10^18 wei). Convert when summarising.");
  lines.push("- txcount is the length of the most recent 10-tx window, NOT total tx history.");
  lines.push("- tx{N}.to is the counterparty for the N-th most recent tx.");
  lines.push("- '(validator consensus failed)' means we DID try to fetch that field but");
  lines.push("  validators disagreed — it is NOT evidence the wallet is empty/inactive.");
  lines.push("  In your summary, note which fields are unavailable rather than guessing.");
  return lines.join("\n");
}

// ---------- main generator ----------

export async function* runInvestigation(
  prompt: string,
  target: string,
  user: `0x${string}`
): AsyncGenerator<StreamEvent> {
  const intent = detectIntent(prompt);

  // ── new agent-loop path ──
  // Prompts that include natural-language context (not just /cmd 0x...) go
  // through the dynamic agent loop: planner LLM picks tools, we execute,
  // aggregator decides if we need more, synth composes the final dossier.
  if (useAgentLoop(prompt, intent)) {
    yield* runAgentLoop(prompt, target, user, intent);
    return;
  }

  // ── legacy fixed pipeline (slash-command without extra question) ──
  const plan = planFor(intent);
  const quote = priceQuote(plan);
  yield { type: "quote", ...quote };
  yield {
    type: "plan",
    steps: plan.map((s) => ({
      id: s.id,
      slug: s.slug,
      fnName: s.fnName,
      description: s.description,
      costEstimateSTT: s.estimateSTT
    }))
  };

  const collected: Record<string, string> = {};
  const citations: Citation[] = [];
  const flagged: Flagged[] = [];

  for (const step of plan) {
    const ctx: BuildCtx = { target, prompt, intent, collected };

    let stepRequestId = "";
    let stepReceiptUrl = "";

    yield { type: "started", stepId: step.id, slug: step.slug, fnName: step.fnName };

    let payload: Hex;
    try {
      payload = buildStepPayload(step, ctx);
    } catch (err) {
      yield { type: "error", stepId: step.id, message: `payload build failed: ${(err as Error).message}` };
      yield { type: "done" };
      return;
    }

    // compute deposit
    const reserve = (await publicClient.readContract({
      address: PLATFORM_ADDRESS,
      abi: PLATFORM_ABI,
      functionName: "getRequestDeposit"
    })) as bigint;
    const pricePerAgent = parseEther(AGENTS[step.slug].pricePerAgent);
    const reward = pricePerAgent * BigInt(SUBCOMMITTEE_SIZE);
    const agentDeposit = reserve + reward;
    const { total: required, fee } = quoteEscrow(agentDeposit);

    yield {
      type: "log",
      stepId: step.id,
      line: `agent ${formatEther(agentDeposit)} + fee ${formatEther(fee)} = ${formatEther(required)} ${ACTIVE_NETWORK.nativeCurrency.symbol}`
    };

    // check user credit
    const credit = (await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "credits",
      args: [user]
    })) as bigint;
    if (credit < required) {
      yield {
        type: "error",
        stepId: step.id,
        message: `insufficient credit: have ${formatEther(credit)} STT, need ${formatEther(required)} STT — top up via the credit bar above.`
      };
      yield { type: "done" };
      return;
    }

    // dispatch via escrow.dispatchFor (orchestrator signs, user's credit drained)
    const { wallet, account } = getOrchestratorWallet();
    const agentId = getAgentId(step.slug);

    yield { type: "log", stepId: step.id, line: `signing escrow.dispatchFor → ${ESCROW_ADDRESS}` };
    // Same dynamic-gas pattern as dispatchPayload — 2.5M is too low for
    // LLM payloads >4 KB. Estimate + 25 % buffer.
    let linearGas: bigint;
    try {
      const est = await publicClient.estimateContractGas({
        address: ESCROW_ADDRESS,
        abi: ESCROW_ABI,
        functionName: "dispatchFor",
        args: [user, agentId, payload, agentDeposit],
        account: account.address
      });
      linearGas = (est * 125n) / 100n;
    } catch {
      linearGas = 5_000_000n;
    }
    let txHash: Hex;
    try {
      txHash = await wallet.writeContract({
        address: ESCROW_ADDRESS,
        abi: ESCROW_ABI,
        functionName: "dispatchFor",
        args: [user, agentId, payload, agentDeposit],
        gas: linearGas,
        account,
        chain: null
      });
    } catch (err) {
      const e = err as Error & { shortMessage?: string; metaMessages?: string[]; details?: string; cause?: unknown };
      const parts: string[] = [];
      parts.push(e.shortMessage || e.message);
      if (e.details && !parts.join(" ").includes(e.details)) parts.push(e.details);
      if (e.metaMessages?.length) parts.push(e.metaMessages.join(" | "));
      const causeMsg = e.cause as { message?: string; shortMessage?: string } | undefined;
      if (causeMsg?.shortMessage) parts.push(`cause: ${causeMsg.shortMessage}`);
      else if (causeMsg?.message) parts.push(`cause: ${causeMsg.message}`);
      console.error("[dispatchFor:linear] slug=%s payloadBytes=%d agentDeposit=%s user=%s", step.slug, (payload.length - 2) / 2, agentDeposit.toString(), user);
      console.error("[dispatchFor:linear] full error:", e);
      yield { type: "error", stepId: step.id, message: `dispatchFor failed: ${parts.join(" — ").slice(0, 500)}` };
      yield { type: "done" };
      return;
    }
    yield { type: "txhash", stepId: step.id, hash: txHash };

    // parse RequestCreated to get somnia requestId
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    // Same revert-detection pattern as the agent-loop path — extract the
    // actual revert reason via eth_call replay instead of surfacing the
    // misleading "event missing" symptom.
    if (receipt.status === "reverted") {
      let revertReason = "(unknown — eth_call returned no data)";
      try {
        const tx = await publicClient.getTransaction({ hash: txHash });
        await publicClient.call({
          account,
          to: tx.to ?? undefined,
          data: tx.input,
          value: tx.value,
          gas: tx.gas,
          blockNumber: receipt.blockNumber
        });
      } catch (callErr) {
        const ce = callErr as Error & { shortMessage?: string; metaMessages?: string[]; details?: string };
        const bits: string[] = [];
        bits.push(ce.shortMessage || ce.message);
        if (ce.details && !bits.join(" ").includes(ce.details)) bits.push(ce.details);
        if (ce.metaMessages?.length) bits.push(ce.metaMessages.slice(0, 2).join(" | "));
        revertReason = bits.join(" — ").slice(0, 400);
      }
      yield { type: "error", stepId: step.id, message: `tx reverted on-chain: ${revertReason}` };
      yield { type: "done" };
      return;
    }

    let requestId: bigint | undefined;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== PLATFORM_ADDRESS.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: PLATFORM_ABI, data: log.data, topics: log.topics });
        if (decoded.eventName === "RequestCreated") {
          requestId = (decoded.args as unknown as { requestId: bigint }).requestId;
          break;
        }
      } catch {
        /* not our event */
      }
    }
    if (requestId === undefined) {
      yield { type: "error", stepId: step.id, message: "RequestCreated event missing from receipt" };
      yield { type: "done" };
      return;
    }
    const receiptUrl = `${AGENT_EXPLORER_URL}/receipts/${requestId}`;
    stepRequestId = requestId.toString();
    stepReceiptUrl = receiptUrl;
    yield {
      type: "request",
      stepId: step.id,
      requestId: stepRequestId,
      deposit: formatEther(agentDeposit),
      receiptUrl
    };
    yield {
      type: "log",
      stepId: step.id,
      line: `requestId ${requestId} · waiting consensus (${SUBCOMMITTEE_SIZE} validators)`
    };

    // poll for finalization
    let fin: { status: ResponseStatus; finalizedBlock: bigint };
    try {
      fin = await waitForFinalization(requestId, receipt.blockNumber, 180, step.slug);
    } catch (err) {
      yield { type: "error", stepId: step.id, message: (err as Error).message };
      yield { type: "done" };
      return;
    }
    yield {
      type: "finalized",
      stepId: step.id,
      status: fin.status,
      finalizedBlock: fin.finalizedBlock.toString()
    };

    // NOTE: We don't bail out on `Failed` here.
    // LLM-inference is non-deterministic — three validators often produce three
    // different texts and on-chain consensus fails by definition. But each
    // validator's individual response is recorded as a signed receipt in
    // Somnia's receipts service. We treat ANY single successful validator
    // response as usable output. The receipt link still shows the on-chain
    // status (Success / Failed) so the user has full transparency.
    if (fin.status === "TimedOut") {
      yield {
        type: "error",
        stepId: step.id,
        message: `timed out — receipt at ${receiptUrl}`
      };
      yield { type: "done" };
      return;
    }
    if (fin.status === "Failed") {
      yield {
        type: "log",
        stepId: step.id,
        line: `on-chain consensus failed (validators disagreed) — falling back to first successful validator receipt`
      };
    }

    // decode result — fetch from Somnia's official receipts HTTP API.
    // On-chain `getRequest()` clears its responses array in the same tx as
    // RequestFinalized, so we can't read them back via eth_call. The
    // receipts HTTP service (receipts.testnet.agents.somnia.host) keeps
    // every validator's response as a signed JSON receipt on Google Cloud
    // Storage; the index returns URLs and each URL has `agentReceipt.result`
    // which is the ABI-encoded bytes we decode.
    let decodedOutput = "";
    try {
      yield { type: "log", stepId: step.id, line: `fetching receipts from somnia receipts service…` };
      const okResult = await fetchValidatorResult(requestId, PLATFORM_ADDRESS, step.slug);
      if (!okResult) {
        yield { type: "log", stepId: step.id, line: `no decodable validator receipt — output empty` };
        decodedOutput = "";
      } else {
        const decoded = decodeFunctionResult({
          abi: getAgentAbi(step.slug) as AbiFunction[],
          functionName: step.fnName,
          data: okResult
        });
        decodedOutput = typeof decoded === "string" ? decoded : JSON.stringify(decoded, bigintReplacer);
        yield { type: "log", stepId: step.id, line: `decoded ${decodedOutput.length} bytes from validator receipt` };
      }
    } catch (err) {
      yield { type: "log", stepId: step.id, line: `decode warning: ${(err as Error).message.slice(0, 120)}` };
      decodedOutput = "";
    }

    collected[step.id] = decodedOutput;
    yield { type: "result", stepId: step.id, output: decodedOutput.slice(0, 500) };

    citations.push({
      id: stepRequestId,
      tag: `${step.slug} · ${step.fnName} · ${step.id}`,
      url: stepReceiptUrl
    });

    // mine flagged items from intermediate JSON outputs (decoder/tracer/etc)
    if (step.id !== "scout" && step.id !== "synth") {
      try {
        const parsed = JSON.parse(decodedOutput);
        if (Array.isArray(parsed.findings)) {
          for (const f of parsed.findings) {
            flagged.push({
              severity: (f.sev || parsed.severity || "med") as Severity,
              title: f.title || step.id,
              body: f.desc || f.description || "",
              ref: f.fn
            });
          }
        }
        if (Array.isArray(parsed.flagged)) {
          for (const f of parsed.flagged) {
            flagged.push({
              severity: (f.severity || "med") as Severity,
              title: f.title || step.id,
              body: f.body || ""
            });
          }
        }
      } catch {
        /* output wasn't JSON — fine, no auto-flags */
      }
    }
  }

  // synthesizer markdown is the last collected entry; fall back to assembling
  // a dossier from intermediate steps if synth produced nothing.
  let finalMarkdown = collected["synth"] || "";
  if (!finalMarkdown.trim()) {
    finalMarkdown = assembleFallbackMarkdown(prompt, target, collected, intent);
  }
  yield {
    type: "dossier",
    markdown: finalMarkdown,
    flagged,
    citations,
    cost: `${priceQuote(plan).total.toFixed(4)} STT`
  };
  yield { type: "done" };
}

function assembleFallbackMarkdown(
  prompt: string,
  target: string,
  collected: Record<string, string>,
  intent: ReturnType<typeof detectIntent>
): string {
  const out: string[] = [];
  out.push(`**Investigation complete** — assembling dossier from on-chain agent outputs.`);
  out.push(``);
  out.push(`> Prompt: ${prompt}`);
  out.push(`> Target: \`${target}\``);
  out.push(`> Intent: \`${intent}\``);
  out.push(``);
  out.push(`## Summary`);
  for (const [id, raw] of Object.entries(collected)) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.verdict) out.push(`- **${id}** — ${parsed.verdict}`);
      else if (parsed.summary) out.push(`- **${id}** — ${parsed.summary}`);
      else out.push(`- **${id}** — ${truncate(raw, 200)}`);
    } catch {
      out.push(`- **${id}** — ${truncate(raw, 200)}`);
    }
  }
  out.push(``);
  out.push(`## Raw outputs`);
  for (const [id, raw] of Object.entries(collected)) {
    if (!raw) continue;
    out.push(`### ${id}`);
    out.push("```");
    out.push(truncate(raw, 1500));
    out.push("```");
  }
  return out.join("\n");
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// ============================================================
//                     DYNAMIC AGENT LOOP
// ============================================================
//
// 1. PLANNER LLM:  given user prompt + tools catalogue, returns JSON
//    {"reasoning":"...", "tool_calls":[{"name":"contract_name","args":{"address":"0x..."}}]}
// 2. EXECUTE:     each tool call → one on-chain json-fetch invocation
// 3. AGGREGATOR LLM: given history + tool results, returns JSON
//    {"done":false, "next_tool_calls":[...]}   OR   {"done":true, "answer":"..."}
// 4. Loop 2–3 up to MAX_ROUNDS, then SYNTH LLM writes the final markdown.

// Tight loop limits — bigger numbers compound LLM latency badly because each
// round = 1 planner call (10–30s) + N tool calls (10–30s each). 2 rounds ×
// 4 tools ≈ 8 on-chain dispatches in 90–180s, which is the UX sweet spot.
// Audit gets a bigger budget because deep contract analysis needs source +
// admin-tx history + state checks across multiple rounds.
// Round caps raised for deep multi-hop chains (token→holders→vesting→
// beneficiary→identity is 5+ hops). The real guards against runaway are the
// STT budget cap + the no-progress detector below, so a higher ceiling is
// safe: the loop stops as soon as it answers OR stops learning.
const MAX_ROUNDS_DEFAULT = 3;
const MAX_ROUNDS_AUDIT = 4;
const MAX_ROUNDS_PROFILE = 6;
const MAX_ROUNDS_FREE = 6;
const MAX_TOOLS_PER_ROUND = 4;

function maxRoundsFor(intent: ReturnType<typeof detectIntent>): number {
  if (intent === "audit")   return MAX_ROUNDS_AUDIT;
  if (intent === "profile") return MAX_ROUNDS_PROFILE;
  if (intent === "free")    return MAX_ROUNDS_FREE;
  return MAX_ROUNDS_DEFAULT;
}

interface ToolCall {
  name: string;
  args: Record<string, string | number>;
}

interface PlannerResponse {
  // Structured deliberation — forces the LLM to articulate what's missing
  // before picking tools, instead of shotgun-firing 4 random calls.
  reasoning?: string;
  goal?: string;              // what does the user actually want
  have?: string[];            // facts already in history
  missing?: string[];         // what's still needed
  next?: string;              // sentence describing the next move
  tool_calls?: ToolCall[];
  done?: boolean;
  answer?: string;
}

// ── adaptive rails: orchestrator-level identity discovery ─────────
//
// Why these exist: telling the planner LLM "always run identity_best on
// surfaced addresses" via system-prompt principles is a SOFT constraint —
// the LLM ignores it under load. We move the critical-path discovery into
// the orchestrator as deterministic logic. The planner still picks tools
// for everything ELSE; identity is on rails.

/** True if user is asking "who/whose/owner/handle/ник/etc" */
function isIdentityQuestion(prompt: string): boolean {
  return /(кто|чей|чьё|чья|чьи|владел|собственник|создатель|основател|ник\b|никнейм|username|handle|whose|who is|who owns|who made|who created|who deployed|who built|owner|deployer)/i.test(prompt);
}

/** Extract every 0x40-char address from tool results in the history. */
function surfacedAddresses(history: Array<{ role: string; content: string }>): string[] {
  const seen = new Set<string>();
  for (const h of history) {
    if (h.role !== "tool") continue;
    const matches = h.content.match(/0x[a-fA-F0-9]{40}/g) || [];
    for (const m of matches) seen.add(m.toLowerCase());
  }
  return [...seen];
}

/** Check if identity_best has ever been called for a given address in history. */
function alreadyIdentityProbed(history: Array<{ role: string; content: string }>, addr: string): boolean {
  const lower = addr.toLowerCase();
  return history.some(
    (h) => h.role === "tool" && h.content.includes("identity_best") && h.content.toLowerCase().includes(lower)
  );
}

/** Detect any identity hit (non-empty, non-null, non-failed) anywhere in history. */
function findIdentityHits(history: Array<{ role: string; content: string }>): Array<{ addr: string; handle: string; source: string }> {
  const hits: Array<{ addr: string; handle: string; source: string }> = [];
  const identityTools = [
    "identity_summary", // on-chain single-dispatch aggregator — primary path
    "contract_owner",   // owner-resolver: "owner=0xABC (handle src, handle2 src2) | admin=…"
    "identity_best", "identity_opensea_handle", "identity_ens_resolved",
    "identity_farcaster_handle", "identity_lens_handle", "identity_mirror_handle",
    "identity_galxe_handle", "address_ens_domain", "address_public_name",
    "identity_opensea", "identity_farcaster", "identity_ens_app"
  ];
  for (const h of history) {
    if (h.role !== "tool") continue;
    for (const tool of identityTools) {
      // Match: tool <tool>(address=0xABC…) → value
      const re = new RegExp(`tool\\s+${tool}\\(([^)]+)\\)\\s+→\\s+(.+?)(?:\\s+\\(cached\\))?$`, "m");
      const m = h.content.match(re);
      if (!m) continue;
      const value = m[2].trim();
      // Skip empty / null / failed / "none on N sources"
      if (!value || value === "(failed)" || value === "null" || value === "(empty)" ||
          value === '""' || value === "''" || value.startsWith("none on") ||
          value.startsWith("no on-chain owner")) continue;

      if (tool === "contract_owner") {
        // "owner=0xABC… (Shiny11111 opensea, ShinyViq x_twitter) | creator=0xDEF…"
        // For each role segment, pull its address and any (handle src, …) list.
        for (const segment of value.split(" | ")) {
          const addrM = segment.match(/0x[a-fA-F0-9]{40}/);
          if (!addrM) continue;
          const ownerAddr = addrM[0];
          const role = segment.split("=")[0]?.trim() || "owner";
          const paren = segment.match(/\(([^)]+)\)/);
          if (paren) {
            // identity present — split "handle src, handle2 src2" or "h (src); h2 (src2)"
            for (const piece of paren[1].split(/[;,]/)) {
              const p = piece.trim();
              if (!p) continue;
              const sm = p.match(/^(.+?)\s+\(?([a-z_]+)\)?$/i);
              if (sm) hits.push({ addr: ownerAddr, handle: `${sm[1].trim()} [${role}]`, source: sm[2].trim() });
              else hits.push({ addr: ownerAddr, handle: `${p} [${role}]`, source: "owner-resolver" });
            }
          }
        }
      } else if (tool === "identity_summary" && value.includes("(") && value.includes(")")) {
        // "handle1 (source1); handle2 (source2)" OR " | " separated.
        const addrMatch = m[1].match(/0x[a-fA-F0-9]{40}/);
        const addr = addrMatch ? addrMatch[0] : "unknown";
        for (const segment of value.split(/\s*[;|]\s*/)) {
          const s = segment.trim();
          const sm = s.match(/^(.+?)\s+\(([^)]+)\)\s*$/);
          if (sm) hits.push({ addr, handle: sm[1].trim(), source: sm[2].trim() });
        }
      } else {
        const addrMatch = m[1].match(/0x[a-fA-F0-9]{40}/);
        const addr = addrMatch ? addrMatch[0] : "unknown";
        hits.push({ addr, handle: value, source: tool });
      }
    }
  }
  return hits;
}

function baseUrl(): string {
  return (process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
}

/**
 * SERVER-SIDE identity probe — direct fetch to our /api/identity aggregator.
 * Bypasses the on-chain agent path entirely: 0 STT, ~2s response, 100 %
 * deterministic. The fetch happens inside our own Next.js process so the
 * "localhost validator unreachability" problem disappears.
 *
 * Returns the best handle (string) or null. ALSO returns the full per-source
 * map so we can surface multi-platform hits in the synth.
 */
async function probeIdentityLocal(address: string): Promise<{ best: string | null; results: Record<string, string | null> }> {
  try {
    const r = await fetch(`${baseUrl()}/api/identity/${address}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return { best: null, results: {} };
    const j = (await r.json()) as { best?: string | null; results?: Record<string, string | null> };
    return { best: j.best ?? null, results: j.results ?? {} };
  } catch {
    return { best: null, results: {} };
  }
}

/**
 * SERVER-SIDE composite snapshot — replaces the on-chain `*_snapshot` tools
 * that were doing 4 sequential dispatches (source step alone could take 30+
 * min because Solidity body is huge). Returns flattened summary string the
 * planner & synth can read straight away.
 */
async function probeSnapshotLocal(address: string): Promise<string | null> {
  try {
    const r = await fetch(`${baseUrl()}/api/snapshot/${address}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      address_info?: { is_contract?: boolean; ens?: string | null; public_name?: string | null; balance_stt?: number | null; creator?: string | null; implementation?: string | null; proxy_type?: string | null };
      counters?: { transactions?: string | null };
      contract?: { name?: string | null; compiler?: string | null; language?: string | null; is_proxy?: boolean; source_size?: number; source_preview?: string | null } | null;
      token?: { name?: string; symbol?: string; total_supply?: string; decimals?: string } | null;
    };
    const parts: string[] = [];
    const a = j.address_info || {};
    parts.push(`is_contract=${a.is_contract}`);
    if (a.balance_stt != null) parts.push(`balance=${a.balance_stt} STT`);
    if (j.counters?.transactions) parts.push(`total_txs=${j.counters.transactions}`);
    if (a.ens) parts.push(`ens=${a.ens}`);
    if (a.public_name) parts.push(`public_name=${a.public_name}`);
    if (a.creator) parts.push(`creator=${a.creator}`);
    if (a.implementation) parts.push(`implementation=${a.implementation}`);
    if (j.contract?.name) parts.push(`name=${j.contract.name}`);
    if (j.contract?.compiler) parts.push(`compiler=${j.contract.compiler}`);
    if (j.contract?.language) parts.push(`language=${j.contract.language}`);
    if (j.contract?.is_proxy != null) parts.push(`is_proxy=${j.contract.is_proxy}`);
    if (j.contract?.source_size) parts.push(`source_bytes=${j.contract.source_size}`);
    if (j.token?.name) parts.push(`token=${j.token.name}/${j.token.symbol}`);
    if (j.contract?.source_preview) parts.push(`source_head=${j.contract.source_preview.slice(0, 400).replace(/\n/g, " ")}`);
    return parts.join(" | ");
  } catch {
    return null;
  }
}

/** Check if a local identity probe has been done for an address in history. */
function alreadyLocalProbed(history: Array<{ role: string; content: string }>, addr: string): boolean {
  const lower = addr.toLowerCase();
  return history.some(
    (h) => h.role === "tool" && h.content.includes("identity_local") && h.content.toLowerCase().includes(lower)
  );
}

export async function* runAgentLoop(
  prompt: string,
  target: string,
  user: `0x${string}`,
  intent: ReturnType<typeof detectIntent>
): AsyncGenerator<StreamEvent> {
  // Build initial plan with placeholder steps the UI shows immediately.
  // Steps get appended as planner discovers more tools.
  const plannerStep: PublicAgentStep = {
    id: "planner.0",
    slug: AGENT_SLUG.LLM_INFERENCE,
    fnName: "inferString",
    description: "planner — pick tools for the question",
    costEstimateSTT: ESTIMATE("llm-inference")
  };
  yield { type: "quote", agents: 0, service: 0, total: ESTIMATE("llm-inference") * 4 };
  yield { type: "plan", steps: [plannerStep] };

  const sys = renderPlannerSystem(prompt, target, intent);
  const history: Array<{ role: "system" | "user" | "tool" | "planner"; key: string; content: string }> = [
    { role: "user", key: "user.prompt", content: `Target: ${target}\nQuestion: ${prompt}` }
  ];

  const citations: Citation[] = [];
  const collected: Record<string, string> = {};
  const toolCache = new Map<string, string>();
  const cacheKey = (name: string, args: Record<string, string | number>) =>
    `${name}|${Object.keys(args).sort().map((k) => `${k}=${args[k]}`).join("&")}`;
  const roundLimit = maxRoundsFor(intent);

  const identityQ = isIdentityQuestion(prompt);
  // Cumulative cost guard — abort runaway investigations.
  let cumulativeCostSTT = 0;
  const HARD_BUDGET_STT = 3.0;
  // Helper: dispatch one rails-injected tool, push to history, track cache.
  async function* runRailTool(
    tId: string,
    name: string,
    args: Record<string, string | number>
  ): AsyncGenerator<StreamEvent, string | undefined> {
    const spec = TOOL_BY_NAME[name];
    if (!spec) { yield { type: "log", stepId: tId, line: `rail ${name} not in catalogue` }; return undefined; }
    const ck = cacheKey(name, args);
    const cached = toolCache.get(ck);
    if (cached !== undefined) {
      yield { type: "started", stepId: tId, slug: AGENT_SLUG.JSON_FETCH, fnName: spec.fn };
      yield { type: "log", stepId: tId, line: `${name}(${formatToolArgs(args)}) → cache hit` };
      yield { type: "result", stepId: tId, output: cached.slice(0, 500) };
      history.push({ role: "tool", key: tId, content: `tool ${name}(${formatToolArgs(args)}) → ${cached} (cached)` });
      collected[tId] = cached;
      return cached;
    }
    let built: BuiltTool;
    try { built = spec.build(args); }
    catch (e) { yield { type: "error", stepId: tId, message: `rail arg build failed: ${(e as Error).message.slice(0, 100)}` }; return undefined; }
    const result = yield* runTool(tId, spec, built, user);
    const value = result ?? "(failed)";
    if (result !== undefined && value !== "(failed)" && value.length < 8000) toolCache.set(ck, value);
    history.push({ role: "tool", key: tId, content: `tool ${name}(${formatToolArgs(args)}) → ${value}` });
    collected[tId] = value;
    return value;
  }

  // ─── PRE-FLIGHT identity probe ─────────────────────────────────
  // For identity questions on a 0x address target, identity-probe locally
  // BEFORE the planner runs. Uses direct server-side fetch — no on-chain
  // dispatch, no STT cost, no validator-consensus risk. Pushed into history
  // as `tool identity_local(addr) → handle` so synth's identity-hit parser
  // surfaces it normally.
  //
  // Also pre-fetch address_creator on-chain (we need this from Blockscout)
  // and then locally probe the creator's identity too.
  async function runLocalIdentity(stepId: string, addr: string, label: string): Promise<void> {
    const t = Date.now();
    const { best, results } = await probeIdentityLocal(addr);
    const value = best ?? "(empty)";
    const summary = best
      ? `${best}  [sources: ${Object.entries(results).filter(([, v]) => v).map(([k]) => k).join(", ")}]`
      : "(no identity found across 7 sources)";
    history.push({ role: "tool", key: stepId, content: `tool identity_local(address=${addr}) → ${value}` });
    collected[stepId] = value;
    // No STT cost — local fetch.
    // emit fake "tool ran" UI so user sees the probe happened
    return; // void
    void label; void t; void summary;
  }

  // ─── PRE-FLIGHT — on-chain Somnia dispatches, real receipts ──
  // For any 0x target, dispatch a small set of high-leverage on-chain tools
  // BEFORE the planner runs, so round 1 starts with the answer often already
  // in hand. Each is ONE fetchString against a smart endpoint returning a
  // <500-char summary → fast validator consensus, real receipt.
  if (/^0x[a-fA-F0-9]{40}$/.test(target)) {
    yield { type: "log", stepId: "preflight", line: `pre-flight: on-chain snapshot + owner + identity (Somnia agents, receipts on agent platform)` };
    yield {
      type: "plan",
      steps: [
        { id: "preflight.snapshot", slug: AGENT_SLUG.JSON_FETCH, fnName: "fetchString", description: `contract_snapshot(${target.slice(0, 10)}…)`, costEstimateSTT: ESTIMATE("json-fetch") },
        { id: "preflight.owner",    slug: AGENT_SLUG.JSON_FETCH, fnName: "fetchString", description: `contract_owner(${target.slice(0, 10)}…)`,    costEstimateSTT: ESTIMATE("json-fetch") },
        { id: "preflight.identity", slug: AGENT_SLUG.JSON_FETCH, fnName: "fetchString", description: `identity_summary(${target.slice(0, 10)}…)`,  costEstimateSTT: ESTIMATE("json-fetch") }
      ]
    };
    const snap = yield* runRailTool("preflight.snapshot", "contract_snapshot", { address: target });
    cumulativeCostSTT += ESTIMATE("json-fetch");

    // contract_owner is THE answer to "who controls this": it reads
    // owner()/admin()/houseManager()/governance()/creator on-chain AND
    // resolves each controller's web-3 identity in the same dispatch.
    const ownerSummary = yield* runRailTool("preflight.owner", "contract_owner", { address: target });
    cumulativeCostSTT += ESTIMATE("json-fetch");

    // identity_summary on the target itself (covers the case where the target
    // is an EOA, e.g. "find the X account of this wallet").
    yield* runRailTool("preflight.identity", "identity_summary", { address: target });
    cumulativeCostSTT += ESTIMATE("json-fetch");

    // Surface any 0x controller/creator the owner-resolver returned but
    // couldn't identity-resolve itself (e.g. nested ownership), and probe it.
    const ownerAddrs = [...(ownerSummary || "").matchAll(/0x[a-fA-F0-9]{40}/g)].map((m) => m[0]);
    const snapCreator = snap?.match(/creator=(0x[a-fA-F0-9]{40})/)?.[1];
    const extra = [...new Set([...(snapCreator ? [snapCreator] : []), ...ownerAddrs])]
      .filter((a) => a.toLowerCase() !== target.toLowerCase())
      .filter((a) => !alreadyIdentityProbed(history, a))
      .slice(0, 1); // one extra hop is enough at pre-flight; planner can go deeper
    if (identityQ && extra.length && cumulativeCostSTT < HARD_BUDGET_STT) {
      yield { type: "log", stepId: "preflight", line: `controller ${extra[0].slice(0, 10)}… surfaced — on-chain identity probe` };
      yield {
        type: "plan",
        steps: [{ id: "preflight.controller_identity", slug: AGENT_SLUG.JSON_FETCH, fnName: "fetchString", description: `identity_summary(controller)`, costEstimateSTT: ESTIMATE("json-fetch") }]
      };
      yield* runRailTool("preflight.controller_identity", "identity_summary", { address: extra[0] });
      cumulativeCostSTT += ESTIMATE("json-fetch");
    }
  }

  // No-progress detector: count distinct successful tool facts in history.
  // If a full round adds zero new facts, the investigation has plateaued —
  // finalize instead of burning more rounds/STT on repeats.
  const factCount = () =>
    history.filter((h) => h.role === "tool" && !/→\s*\(failed\)\s*$/.test(h.content)).length;
  let lastFactCount = factCount();

  for (let round = 0; round < roundLimit; round++) {
    // ─── budget guard ────────────────────────────────────────
    if (cumulativeCostSTT > HARD_BUDGET_STT) {
      yield { type: "log", stepId: `planner.${round}`, line: `cumulative cost ${cumulativeCostSTT.toFixed(2)} STT > ${HARD_BUDGET_STT} STT cap — finalizing with what we have` };
      break;
    }
    // ─── no-progress guard ───────────────────────────────────
    // After the first round, if the previous round produced no new facts,
    // stop — the agent is spinning. (Checked at round start using the count
    // captured at the end of the prior round.)
    if (round > 1) {
      const now = factCount();
      if (now <= lastFactCount) {
        yield { type: "log", stepId: `planner.${round}`, line: `no new facts last round — finalizing (plateau)` };
        break;
      }
      lastFactCount = now;
    } else {
      lastFactCount = factCount();
    }
    // ─── early-stop on identity hit ──────────────────────────
    // If user asked "who/etc" AND we've found at least one identity hit
    // AND we've done at least one planner round, force synth.
    if (identityQ && round > 0) {
      const hits = findIdentityHits(history);
      if (hits.length > 0) {
        yield { type: "log", stepId: `planner.${round}`, line: `identity found (${hits.length} hit(s)) — finalizing early` };
        break;
      }
    }
    // ─── planner step ────────────────────────────────────────
    const stepId = `planner.${round}`;
    if (round > 0) {
      yield {
        type: "plan",
        steps: [{ id: stepId, slug: AGENT_SLUG.LLM_INFERENCE, fnName: "inferString", description: `round ${round + 1} planner`, costEstimateSTT: ESTIMATE("llm-inference") }]
      };
    }
    const plannerPrompt = renderPlannerUser(history);
    let plannerOut = yield* runLLM(stepId, sys, plannerPrompt, user);
    // Transient failure recovery: validator subcommittees on Somnia testnet
    // occasionally drop a request (consensus timeout, validator churn). Retry
    // ONCE under a fresh stepId before declaring the round dead — saves the
    // user from losing their entire investigation to a single network blip.
    if (!plannerOut) {
      const retryId = `${stepId}.retry`;
      yield { type: "log", stepId, line: `planner returned nothing — retrying once (transient validator failure?)` };
      yield {
        type: "plan",
        steps: [{ id: retryId, slug: AGENT_SLUG.LLM_INFERENCE, fnName: "inferString", description: `retry round ${round + 1} planner`, costEstimateSTT: ESTIMATE("llm-inference") }]
      };
      plannerOut = yield* runLLM(retryId, sys, plannerPrompt, user);
    }
    if (!plannerOut) {
      yield { type: "error", stepId, message: "planner failed twice — check /api/health for Somnia network status" };
      yield { type: "done" };
      return;
    }
    collected[stepId] = plannerOut;
    history.push({ role: "planner", key: stepId, content: plannerOut });

    let parsed: PlannerResponse;
    try {
      parsed = parsePlannerJson(plannerOut);
    } catch (err) {
      yield { type: "log", stepId, line: `planner output not parseable as JSON — treating as final answer` };
      // Treat as final answer
      yield {
        type: "dossier",
        markdown: `**Verdict:** ${plannerOut.slice(0, 200)}\n\n${plannerOut}`,
        flagged: [],
        citations,
        cost: "—"
      };
      yield { type: "done" };
      return;
    }

    if (parsed.done && parsed.answer) {
      // ─── final synth ──
      const synthId = "synth";
      yield { type: "plan", steps: [{ id: synthId, slug: AGENT_SLUG.LLM_INFERENCE, fnName: "inferString", description: "compose final dossier", costEstimateSTT: ESTIMATE("llm-inference") }] };
      const synthSys = renderSynthSystem(intent);
      const synthPrompt = renderSynthUser(prompt, target, history, parsed.answer);
      const synthOut = (yield* runLLM(synthId, synthSys, synthPrompt, user)) || parsed.answer;
      yield {
        type: "dossier",
        markdown: synthOut,
        flagged: [],
        citations,
        cost: `${(round + 1) * 0.36} STT (approx)`
      };
      yield { type: "done" };
      return;
    }

    const toolCalls = (parsed.tool_calls || []).slice(0, MAX_TOOLS_PER_ROUND);
    if (toolCalls.length === 0) {
      yield { type: "log", stepId, line: "planner returned no tool calls — composing final dossier" };
      break;
    }

    // ─── execute tool calls ──────────────────────────────────
    const toolSteps: PublicAgentStep[] = toolCalls.map((tc, i) => ({
      id: `tool.${round}.${i}`,
      slug: AGENT_SLUG.JSON_FETCH,
      fnName: "fetchString",
      description: `${tc.name}(${formatToolArgs(tc.args)})`,
      costEstimateSTT: ESTIMATE("json-fetch")
    }));
    yield { type: "plan", steps: toolSteps };

    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      const tId = `tool.${round}.${i}`;
      const spec = TOOL_BY_NAME[tc.name];
      if (!spec) {
        yield { type: "error", stepId: tId, message: `unknown tool: ${tc.name}` };
        continue;
      }
      const key = cacheKey(tc.name, tc.args);
      const cached = toolCache.get(key);
      if (cached !== undefined) {
        // Replay cached result — no on-chain dispatch, no STT spent.
        yield { type: "started", stepId: tId, slug: AGENT_SLUG.JSON_FETCH, fnName: spec.fn };
        yield { type: "log", stepId: tId, line: `${tc.name}(${formatToolArgs(tc.args)}) → cache hit, reusing prior result` };
        yield { type: "result", stepId: tId, output: cached.slice(0, 500) };
        history.push({ role: "tool", key: tId, content: `tool ${tc.name}(${formatToolArgs(tc.args)}) → ${cached} (cached)` });
        collected[tId] = cached;
        continue;
      }

      // No server-side shortcuts here: every tool call goes through the
      // on-chain Somnia agent (real receipt, real STT). The smart data
      // providers at /api/snapshot and /api/identity make on-chain consensus
      // fast by pre-digesting upstream into <500-char summary fields, but
      // the dispatch itself is unconditionally on-chain.
      let built: BuiltTool;
      try {
        built = spec.build(tc.args);
      } catch (err) {
        yield { type: "error", stepId: tId, message: `tool arg build failed: ${(err as Error).message.slice(0, 100)}` };
        continue;
      }
      const result = yield* runTool(tId, spec, built, user);
      const value = result ?? "(failed)";
      // Cache successful results only — '(failed)' should be retryable next
      // session (e.g., a flaky Blockscout). Also avoids caching giant blobs.
      if (result !== undefined && value !== "(failed)" && value.length < 8000) {
        toolCache.set(key, value);
      }
      history.push({ role: "tool", key: tId, content: `tool ${tc.name}(${formatToolArgs(tc.args)}) → ${value}` });
      collected[tId] = value;
      cumulativeCostSTT += ESTIMATE("json-fetch");
    }

    // ─── AUTO-INJECT identity probes on newly surfaced addresses ──
    // After each round, scan tool results for any 0x address we haven't
    // identity-probed yet. ON-CHAIN dispatch via identity_summary tool —
    // real receipt on Somnia agent platform, real STT (~0.18 per probe),
    // small consensus payload because /api/identity returns a <300-char
    // summary string. Capped at 2 per round to control spend.
    if (identityQ && cumulativeCostSTT < HARD_BUDGET_STT) {
      const candidates = surfacedAddresses(history)
        .filter((a) => a !== target.toLowerCase())          // target was pre-flighted
        .filter((a) => !alreadyIdentityProbed(history, a))
        .slice(0, 2);
      if (candidates.length > 0) {
        const railSteps: PublicAgentStep[] = candidates.map((a, i) => ({
          id: `rail.${round}.${i}`,
          slug: AGENT_SLUG.JSON_FETCH,
          fnName: "fetchString",
          description: `identity_summary(${a.slice(0, 10)}…) [on-chain]`,
          costEstimateSTT: ESTIMATE("json-fetch")
        }));
        yield { type: "plan", steps: railSteps };
        for (let i = 0; i < candidates.length; i++) {
          yield* runRailTool(`rail.${round}.${i}`, "identity_summary", { address: candidates[i] });
          cumulativeCostSTT += ESTIMATE("json-fetch");
        }
      }
    }
  }

  // ─── ran out of rounds — synth with what we have ──
  const synthId = "synth";
  yield { type: "plan", steps: [{ id: synthId, slug: AGENT_SLUG.LLM_INFERENCE, fnName: "inferString", description: "compose final dossier (round limit reached)", costEstimateSTT: ESTIMATE("llm-inference") }] };
  const synthSys = renderSynthSystem(intent);
  const synthPrompt = renderSynthUser(prompt, target, history, null);
  const synthOut = (yield* runLLM(synthId, synthSys, synthPrompt, user)) || assembleFallbackMarkdown(prompt, target, collected, intent);
  yield {
    type: "dossier",
    markdown: synthOut,
    flagged: [],
    citations,
    cost: `~${roundLimit * 0.36 + MAX_TOOLS_PER_ROUND * roundLimit * 0.18} STT`
  };
  yield { type: "done" };
}

/** Run one on-chain Somnia llm-inference call and return decoded string. */
async function* runLLM(
  stepId: string,
  systemPrompt: string,
  userPrompt: string,
  user: `0x${string}`
): AsyncGenerator<StreamEvent, string | undefined> {
  yield { type: "started", stepId, slug: AGENT_SLUG.LLM_INFERENCE, fnName: "inferString" };
  const payload = encodeInferString({ prompt: userPrompt.slice(0, 4000), system: systemPrompt, chainOfThought: true });
  const result = yield* dispatchPayload(stepId, AGENT_SLUG.LLM_INFERENCE, "inferString", payload, user);
  return result;
}

/** Run one on-chain Somnia tool call (json-fetch OR llm-parse-website). */
async function* runTool(
  stepId: string,
  spec: ToolSpec,
  built: BuiltTool,
  user: `0x${string}`
): AsyncGenerator<StreamEvent, string | undefined> {
  yield { type: "log", stepId, line: `tool ${spec.name} · ${spec.agent}.${spec.fn}` };

  if (built.kind === "fetchString") {
    yield { type: "started", stepId, slug: AGENT_SLUG.JSON_FETCH, fnName: "fetchString" };
    return yield* dispatchPayload(stepId, AGENT_SLUG.JSON_FETCH, "fetchString", encodeJsonFetchString(built.url, built.selector), user);
  }
  if (built.kind === "fetchUint") {
    yield { type: "started", stepId, slug: AGENT_SLUG.JSON_FETCH, fnName: "fetchUint" };
    return yield* dispatchPayload(stepId, AGENT_SLUG.JSON_FETCH, "fetchUint", encodeJsonFetchUint(built.url, built.selector, built.decimals), user);
  }
  if (built.kind === "ExtractString") {
    yield { type: "started", stepId, slug: AGENT_SLUG.LLM_PARSE_WEBSITE, fnName: "ExtractString" };
    yield { type: "log", stepId, line: `browser → ${built.url}${built.resolveUrl ? " (with search)" : ""}` };
    const payload = encodeExtractString({
      key: built.key,
      description: built.description,
      options: built.options,
      prompt: built.prompt,
      url: built.url,
      resolveUrl: built.resolveUrl,
      numPages: built.numPages
    });
    return yield* dispatchPayload(stepId, AGENT_SLUG.LLM_PARSE_WEBSITE, "ExtractString", payload, user);
  }
  if (built.kind === "fetchBool") {
    // Treat fetchBool as fetchString — the boolean is encoded as a string
    // ('true'/'false') in the json-fetch agent's wire format.
    yield { type: "started", stepId, slug: AGENT_SLUG.JSON_FETCH, fnName: "fetchString" };
    yield { type: "log", stepId, line: `tool ${spec.name} · fetchBool→fetchString fallback` };
    return yield* dispatchPayload(stepId, AGENT_SLUG.JSON_FETCH, "fetchString", encodeJsonFetchString(built.url, built.selector), user);
  }
  if (built.kind === "composite") {
    // Fan out to each sub-tool sequentially under the same logical slot.
    // We can't parallelise because the orchestrator EOA's nonce is strictly
    // ordered — concurrent writeContract calls would collide. Each sub-call
    // is its own on-chain receipt, but we surface a single joined result
    // upstream so the planner spends just one of its 4-call budget slots.
    yield { type: "started", stepId, slug: AGENT_SLUG.JSON_FETCH, fnName: spec.fn };
    yield { type: "log", stepId, line: `composite ${spec.name} — ${built.steps.length} sub-calls` };
    const parts: string[] = [];
    let anySuccess = false;
    for (let s = 0; s < built.steps.length; s++) {
      const sub = built.steps[s];
      const subId = `${stepId}.sub.${s}`;
      yield { type: "log", stepId, line: `  ↳ ${sub.label} (${s + 1}/${built.steps.length})` };
      let value: string | undefined;
      if (sub.sub.kind === "fetchString") {
        value = yield* dispatchPayload(subId, AGENT_SLUG.JSON_FETCH, "fetchString", encodeJsonFetchString(sub.sub.url, sub.sub.selector), user);
      } else if (sub.sub.kind === "fetchUint") {
        value = yield* dispatchPayload(subId, AGENT_SLUG.JSON_FETCH, "fetchUint", encodeJsonFetchUint(sub.sub.url, sub.sub.selector, sub.sub.decimals), user);
      } else if (sub.sub.kind === "fetchBool") {
        value = yield* dispatchPayload(subId, AGENT_SLUG.JSON_FETCH, "fetchString", encodeJsonFetchString(sub.sub.url, sub.sub.selector), user);
      } else {
        // composites currently only support primitive json-fetch sub-tools
        value = undefined;
      }
      if (value !== undefined) anySuccess = true;
      // Clip each sub-result so the joined string stays compact for synth.
      parts.push(`${sub.label}=${(value ?? "(failed)").slice(0, 200)}`);
    }
    if (!anySuccess) return undefined;
    const joined = parts.join(" | ");
    yield { type: "result", stepId, output: joined.slice(0, 500) };
    return joined;
  }
  yield { type: "error", stepId, message: `unsupported tool kind: ${(built as { kind: string }).kind}` };
  return undefined;
}

/**
 * NATIVE Somnia agentic mode — single inferToolsChat dispatch where the
 * Somnia LLM agent self-directs an entire investigation. The validator
 * subcommittee runs an internal tool-call loop:
 *   1. LLM reads user question
 *   2. picks a tool from our MCP catalogue (via mcpServerUrls)
 *   3. validator fetches the MCP tool via json-fetch agent
 *   4. result comes back, LLM reasons, picks next tool
 *   5. iterates up to maxIterations, finishes
 *
 * ONE on-chain dispatch, ONE receipt for the entire investigation. The
 * purest expression of Somnia's agentic L1 capability. Used in /api/investigate-native.
 */
export async function* runNativeAgentic(
  prompt: string,
  target: string,
  user: `0x${string}`,
  maxIterations = 5
): AsyncGenerator<StreamEvent> {
  const stepId = "native";
  const base = (process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
  const mcpUrl = `${base}/api/mcp`;

  yield { type: "quote", agents: 0, service: 0, total: ESTIMATE("llm-inference") * 2 };
  yield {
    type: "plan",
    steps: [{
      id: stepId,
      slug: AGENT_SLUG.LLM_INFERENCE,
      fnName: "inferToolsChat",
      description: `native Somnia agent · MCP @ ${mcpUrl} · maxIterations=${maxIterations}`,
      costEstimateSTT: ESTIMATE("llm-inference") * 2
    }]
  };

  const systemMsg = [
    "You are {s}hinyAudit — an on-chain investigator on Somnia testnet (chain id 50312).",
    `Target: ${target}.`,
    "Reply in the user's language. Use the MCP tools available to gather facts on-chain.",
    "Every tool call you make is itself an on-chain Somnia agent invocation with a receipt.",
    "Prefer *_snapshot and identity_summary tools — they return rich summaries in one call.",
    "When you have a confident answer, return concise markdown with the verdict, key facts, and addresses you cited.",
    "NEVER invent values. Only cite literals from tool results."
  ].join("\n");

  const payload = encodeInferToolsChat({
    roles: ["system", "user"],
    messages: [systemMsg, prompt],
    mcpServerUrls: [mcpUrl],
    onchainTools: [],
    maxIterations,
    chainOfThought: true
  });

  const result = yield* dispatchPayload(stepId, AGENT_SLUG.LLM_INFERENCE, "inferToolsChat", payload, user);
  if (!result) {
    yield { type: "error", stepId, message: "native inferToolsChat returned no output" };
    yield { type: "done" };
    return;
  }
  // inferToolsChat returns a tuple — first element is finishReason, second is response.
  // Our decoder JSON.stringify-ed it; parse to extract the user-facing text.
  let answer = result;
  try {
    const parsed = JSON.parse(result);
    if (Array.isArray(parsed) && typeof parsed[1] === "string") answer = parsed[1];
    else if (parsed?.response) answer = String(parsed.response);
  } catch {
    /* if not JSON, use raw string */
  }

  yield {
    type: "dossier",
    markdown: answer,
    flagged: [],
    citations: [],
    cost: "~0.36 STT (native single-dispatch)"
  };
  yield { type: "done" };
}

/** Shared on-chain dispatch path used by both runLLM and runScout. */
async function* dispatchPayload(
  stepId: string,
  slug: AgentSlug,
  fnName: string,
  payload: Hex,
  user: `0x${string}`
): AsyncGenerator<StreamEvent, string | undefined> {
  const reserve = (await publicClient.readContract({
    address: PLATFORM_ADDRESS,
    abi: PLATFORM_ABI,
    functionName: "getRequestDeposit"
  })) as bigint;
  const pricePerAgent = parseEther(AGENTS[slug].pricePerAgent);
  const reward = pricePerAgent * BigInt(SUBCOMMITTEE_SIZE);
  const agentDeposit = reserve + reward;
  const { total: required } = quoteEscrow(agentDeposit);

  const credit = (await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: ESCROW_ABI,
    functionName: "credits",
    args: [user]
  })) as bigint;
  if (credit < required) {
    yield { type: "error", stepId, message: `insufficient credit: have ${formatEther(credit)} STT, need ${formatEther(required)} STT — top up.` };
    return undefined;
  }

  const { wallet, account } = getOrchestratorWallet();
  const agentId = getAgentId(slug);

  // Pre-flight: orchestrator EOA must hold STT to pay gas. If it doesn't,
  // the tx broadcasts (mempool accepts the signed payload) but mines as
  // reverted with no logs — historically surfaced as "RequestCreated event
  // missing". Fail fast with an actionable message instead.
  const orchBal = await publicClient.getBalance({ address: account.address });
  // 2.5M gas × ~10 gwei = 0.025 STT, but Somnia gas can spike — require 0.05 STT minimum.
  const MIN_GAS_BUFFER = 50_000_000_000_000_000n; // 0.05 STT
  if (orchBal < MIN_GAS_BUFFER) {
    yield {
      type: "error",
      stepId,
      message: `orchestrator wallet out of gas: balance ${formatEther(orchBal)} STT < 0.05 STT floor. Top up ${account.address} (testnet faucet).`
    };
    return undefined;
  }

  // DYNAMIC GAS: hardcoded 2.5M was fine for small json-fetch payloads but
  // a 6 KB planner inferString needs ~3.3M (calldata dominates). Estimate +
  // 25 % buffer keeps us inside block-gas while never under-funding.
  let gas: bigint;
  try {
    const est = await publicClient.estimateContractGas({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "dispatchFor",
      args: [user, agentId, payload, agentDeposit],
      account: account.address
    });
    gas = (est * 125n) / 100n; // +25 % buffer
  } catch {
    // Estimator can revert if the call would itself revert (e.g. credit too low).
    // Fall back to a generous fixed amount — writeContract will surface the
    // real reason below.
    gas = 5_000_000n;
  }

  let txHash: Hex;
  try {
    txHash = await wallet.writeContract({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "dispatchFor",
      args: [user, agentId, payload, agentDeposit],
      gas,
      account,
      chain: null
    });
  } catch (err) {
    // Surface viem's full revert reason. The default truncation was hiding
    // payload-validation errors from the Somnia platform behind a generic
    // "Missing or invalid parameters". We log the rich structure on the
    // server and ship a shortened-but-useful message to the client.
    const e = err as Error & { shortMessage?: string; metaMessages?: string[]; details?: string; cause?: unknown };
    const parts: string[] = [];
    if (e.shortMessage) parts.push(e.shortMessage);
    else parts.push(e.message);
    if (e.details && !parts.join(" ").includes(e.details)) parts.push(e.details);
    if (e.metaMessages?.length) parts.push(e.metaMessages.join(" | "));
    const causeMsg = (e.cause as { message?: string; shortMessage?: string } | undefined);
    if (causeMsg) {
      if (causeMsg.shortMessage) parts.push(`cause: ${causeMsg.shortMessage}`);
      else if (causeMsg.message) parts.push(`cause: ${causeMsg.message}`);
    }
    const richMessage = parts.join(" — ").slice(0, 500);
    console.error("[dispatchFor] slug=%s fn=%s payloadBytes=%d agentDeposit=%s user=%s", slug, fnName, (payload.length - 2) / 2, agentDeposit.toString(), user);
    console.error("[dispatchFor] full error:", e);
    yield { type: "error", stepId, message: `dispatchFor failed: ${richMessage}` };
    return undefined;
  }
  yield { type: "txhash", stepId, hash: txHash };

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  // tx reverted: re-execute via eth_call at the tx's block to extract the
  // actual revert reason. Without this we used to surface the misleading
  // "RequestCreated event missing" — a downstream symptom, not the cause.
  if (receipt.status === "reverted") {
    let revertReason = "(unknown — eth_call returned no data)";
    try {
      const tx = await publicClient.getTransaction({ hash: txHash });
      await publicClient.call({
        account,
        to: tx.to ?? undefined,
        data: tx.input,
        value: tx.value,
        gas: tx.gas,
        blockNumber: receipt.blockNumber
      });
      // If call() didn't throw, something's weird — receipt says reverted but call says ok.
      revertReason = "tx reverted but eth_call replay succeeded (state changed since mining?)";
    } catch (callErr) {
      const ce = callErr as Error & { shortMessage?: string; metaMessages?: string[]; details?: string };
      const bits: string[] = [];
      bits.push(ce.shortMessage || ce.message);
      if (ce.details && !bits.join(" ").includes(ce.details)) bits.push(ce.details);
      if (ce.metaMessages?.length) bits.push(ce.metaMessages.slice(0, 2).join(" | "));
      revertReason = bits.join(" — ").slice(0, 400);
    }
    yield { type: "error", stepId, message: `tx reverted on-chain: ${revertReason}` };
    return undefined;
  }

  let requestId: bigint | undefined;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== PLATFORM_ADDRESS.toLowerCase()) continue;
    try {
      const d = decodeEventLog({ abi: PLATFORM_ABI, data: log.data, topics: log.topics });
      if (d.eventName === "RequestCreated") {
        requestId = (d.args as unknown as { requestId: bigint }).requestId;
        break;
      }
    } catch {
      /* not our event */
    }
  }
  if (requestId === undefined) {
    // tx succeeded (status==success) but no platform log — means escrow
    // contract emitted only its own events, never reached createRequest.
    // Most common cause: somehow status==success without calling platform.
    yield { type: "error", stepId, message: "RequestCreated event missing (tx succeeded but escrow never reached platform.createRequest)" };
    return undefined;
  }

  const receiptUrl = `${AGENT_EXPLORER_URL}/receipts/${requestId}`;
  yield { type: "request", stepId, requestId: requestId.toString(), deposit: formatEther(agentDeposit), receiptUrl };

  let fin: { status: ResponseStatus; finalizedBlock: bigint };
  try {
    fin = await waitForFinalization(requestId, receipt.blockNumber, 180, slug);
  } catch (err) {
    yield { type: "error", stepId, message: (err as Error).message };
    return undefined;
  }
  yield { type: "finalized", stepId, status: fin.status, finalizedBlock: fin.finalizedBlock.toString() };

  if (fin.status === "TimedOut") return undefined;

  const okResult = await fetchValidatorResult(requestId, PLATFORM_ADDRESS, slug);
  if (!okResult) return undefined;
  try {
    const decoded = decodeFunctionResult({
      abi: getAgentAbi(slug) as AbiFunction[],
      functionName: fnName,
      data: okResult
    });
    const output = typeof decoded === "string" ? decoded : JSON.stringify(decoded, bigintReplacer);
    yield { type: "result", stepId, output: output.slice(0, 500) };
    return output;
  } catch {
    return undefined;
  }
}

// Public re-exports for /api/debug (payload-size inspector). Kept thin so the
// debug route can introspect what we ship on-chain without depending on the
// orchestrator's internals.
export function renderPlannerSystemFor(prompt: string, target: string, intent: string): string {
  return renderPlannerSystem(prompt, target, intent as ReturnType<typeof detectIntent>);
}
export function renderAuditSynthSystemPublic(): string {
  return renderAuditSynthSystem();
}

function renderPlannerSystem(_prompt: string, target: string, intent: ReturnType<typeof detectIntent>): string {
  return [
    `You are the PLANNER of {s}hinyAudit on Somnia testnet (chain id 50312). Target: ${target}. Intent: ${intent}.`,
    "Understand the user's question in ANY language. Reply ONLY with strict JSON.",
    "",
    "TOOLS (each = 1 on-chain invocation ~30s ~0.18 STT). Lines without description are valid tools, treat name(args) as the full spec:",
    renderToolsCatalogueFor(intent),
    "",
    "Your job each round: read history, decide which tools to call NEXT, then either request more or finalise.",
    "",
    "Output STRICT JSON, nothing else. No markdown wrapping. Two valid shapes:",
    "",
    "A) Need more data — STRUCTURED DELIBERATION (every field required):",
    '{',
    '  "goal": "<one sentence: what does the user literally want>",',
    '  "have": ["<fact 1 from history>", "<fact 2>", ...],',
    '  "missing": ["<specific gap 1>", "<gap 2>", ...],',
    '  "next": "<one sentence: what move closes the biggest gap>",',
    '  "tool_calls": [{"name":"contract_name","args":{"address":"0x..."}}, ...]',
    '}',
    "",
    "B) Have enough data:",
    '{"done":true,"answer":"<full markdown answer citing exact addresses/values you saw>"}',
    "",
    "Filling 'have'/'missing' BEFORE picking tool_calls is mandatory — agents that articulate the gap pick the right tool. Empty 'missing' means you should set done=true.",
    "",
    "HARD RULES:",
    "- MAX 4 tool calls per round, up to 4 rounds for profile/free, 3 for audit, 2 for trace/xray/watch/stealth.",
    "- NEVER invent values — every claim must echo a literal from the tool history.",
    "- Same tool+args in round 2+ is served from cache for FREE — but only re-ask if you actually need the value again.",
    "- If a tool returns '(failed)', do NOT re-request same args — pick a different tool or a different angle.",
    "- BATCH per round: 4 different tools that attack different angles, not 4 variations of the same.",
    "- PREFER *_snapshot composite tools (contract_snapshot, wallet_snapshot, tx_snapshot, token_snapshot) — one slot, 4 facts.",
    "",
    "PRINCIPLES — think like an investigator, not a script:",
    "",
    "1. ALWAYS START with one composite snapshot of the primary target (contract_snapshot if contract, wallet_snapshot if EOA). It pulls 4 base facts so you can REASON about what to do next.",
    "",
    "1b. view_call IS YOUR SKELETON KEY. If the question needs ANY on-chain value a named tool doesn't cover, call view_call(to, 'signature()', args). Examples: pool depth → view_call(pool,'getReserves()'); team's token balance → view_call(token,'balanceOf(address)','0xTEAM'); vesting unlock → view_call(vesting,'cliff()') + view_call(vesting,'released()') + view_call(vesting,'beneficiary()'); supply cap → view_call(token,'maxSupply()'); paused → view_call(c,'paused()'). NEVER answer 'cannot be determined' before trying view_call with the obvious getter for that question.",
    "",
    "1c. discover IS FOR FIND-BY-CRITERION questions (no specific address given). 'top/new projects', 'who's building', 'newest contracts' → discover(kind='fresh',days=7) or discover(kind='trending'). 'find <name> protocol/token' → discover(kind='search',q='<name>'). 'biggest tokens' → discover(kind='tokens'). Then snapshot/identity the interesting results.",
    "",
    "2. EVERY surfaced 0x address (creator, owner, oracle, factory, implementation, treasury, governance, top counterparty, first funder) is a NEW investigation lead. Walk the graph. Multi-hop is normal.",
    "",
    "3. IDENTITY-FIRST when the user asked 'who/кто/чей/владелец/owner/ник/username/handle/создатель/основатель/deployer'. The MOMENT you have an address to identify, your next round MUST include:",
    "   • identity_best(address) — single aggregator covering OpenSea + ENS + Farcaster + Lens + Mirror + Galxe",
    "   • identity_opensea_handle(address), identity_ens_resolved(address) — individual hits surface alongside",
    "   These off-chain identity lookups are LITERALLY the product. Skipping them defeats the purpose.",
    "",
    "4. FRESH-WALLET DETECTION — if the target wallet has very few txs (address_total_txs < 20) OR is recent (address_first_tx_timestamp within last 30 days), it's a 'fresh / single-purpose' wallet. Identity probes will almost certainly come back empty. ESCALATE: call address_first_tx_funder(address) — get the funder, then identity_best on THE FUNDER. The deployer's real wallet is often the funder.",
    "",
    "5. FUNDING-TRAIL DEAD-ENDS — if the funder turns out to be a CEX (contract_name returns 'Binance/Bybit/Bitget/Kucoin/OKX/Coinbase' or similar), stop — that's an off-chain KYC source we can't follow. Say so honestly in the answer. Try address_second_funder for a backup lead.",
    "",
    "6. AUDIT — when the user asked for an audit, after contract_snapshot, peel the source for hardcoded addresses (oracles, owners, beneficiaries) and call contract_name on each. The category-specific checklist is the synth's job; your job is to feed it surface area.",
    "",
    "7. FUND FLOWS (trace) — for native, tx_counterparty + tx_value on indices 0..2 then contract_name on the top sink. For tokens, the tokentx_* family. Always contract_name on the destination to label the protocol.",
    "",
    "8. TOKEN X-RAY — token_snapshot first, then token_v2_holders_count + top holder + contract_is_proxy + address_creator + identity_best on creator.",
    "",
    "9. STEALTH-LAUNCH HUNT — internal_deploy_addr(0,1,2) → contract_name on each. If any is an unverified fresh contract, run contract_deployed_bytecode for a signature. address_first_tx_funder on the deployer wallet then identity_best — that's how you de-anon a stealth launch.",
    "",
    "10. STOP CONDITIONS — set done=true and write the answer when EITHER (a) you've answered the user's literal question with cited values, OR (b) you've exhausted reasonable angles and the honest answer is 'evidence not present on-chain — here's what I tried'. Honest 'I couldn't find X but I looked at Y, Z, W' beats invented confidence."
  ].join("\n");
}

function renderPlannerUser(history: Array<{ role: string; key: string; content: string }>): string {
  const lines: string[] = [];
  lines.push("=== History ===");
  for (const h of history) {
    if (h.role === "user") {
      lines.push(`USER: ${h.content}`);
    } else if (h.role === "planner") {
      lines.push(`PLANNER[${h.key}]: ${h.content.slice(0, 300)}`);
    } else if (h.role === "tool") {
      lines.push(h.content);
    }
  }
  lines.push("");
  lines.push("=== Decide next move (JSON only) ===");
  return lines.join("\n");
}

function renderSynthSystem(intent: ReturnType<typeof detectIntent>): string {
  // Audit gets a specialized exhaustive synthesizer that walks the LLM
  // through a vulnerability checklist instead of a generic summary.
  if (intent === "audit") return renderAuditSynthSystem();
  return [
    "You are the SYNTHESIZER of {s}hinyAudit (Somnia testnet, chain id 50312).",
    `Intent: ${intent}.`,
    "Read the entire conversation + tool results in the history, and compose the user-facing answer.",
    "",
    "LANGUAGE RULE — match the user's language.",
    "If the user asked in Russian, reply in Russian. If Spanish, Spanish. If English, English.",
    "Keep technical terms (addresses, tx hashes, function names, contract names) in their original form.",
    "",
    "Output ONLY markdown — no JSON, no preamble.",
    "",
    "FORMAT:",
    "Line 1: **Verdict:** <one bold sentence based on real tool data>",
    "Blank line.",
    "## Summary",
    "- bullet 1 (one fact per line, with real values in `backticks`)",
    "- bullet 2",
    "Blank line.",
    "## Findings",
    "- finding 1 — cite exact addresses, hashes, contract names from tool history",
    "Blank line.",
    "## Counterparties (only if applicable)",
    "- `0x...` — contract_name if known, otherwise 'unknown'",
    "Blank line.",
    "## Citations",
    "- list every tool call result you used, like `tool_name(args) = value`",
    "",
    "RULES:",
    "- NEVER invent protocols, names, or addresses. Echo only tool-result values.",
    "- balances are in wei. Convert: divide by 10^18 → STT, round to 4 decimals.",
    "- If a counterparty's contract_name is non-empty, it IS the real protocol — name it.",
    "- If a counterparty has no contract_name, label it 'EOA or unverified contract'.",
    "- If many tools returned (failed), say 'partial data — some validator consensus failed'.",
    "",
    "IDENTITY SURFACING — non-negotiable:",
    "- identity_summary returns EVERY connected account in one string, e.g. 'selskayashiny (opensea); ShinyViq (x_twitter); vitalik.eth (ensideas)'. Each segment is a SEPARATE handle on a SEPARATE platform.",
    "- List EVERY segment in the verdict. Map source codes to readable names: opensea→OpenSea, x_twitter→X/Twitter, instagram→Instagram, website→website, ensideas/ens_subgraph→ENS, farcaster→Farcaster, lens→Lens, mirror→Mirror, galxe→Galxe.",
    "- Example verdict: \"`0xABC…` is **selskayashiny** on OpenSea, **@ShinyViq** on X/Twitter\". Always include the X/Twitter handle if present — users care most about it.",
    "- NEVER conclude 'no X account' or 'no identity link' if identity_summary contains an x_twitter segment or any non-empty segment. Read the WHOLE string, not just the first segment.",
    "- If multiple platforms agree on the same handle, note the cross-platform confirmation.",
    "",
    "FUNDING-TRAIL SURFACING:",
    "- If the tool history contains address_first_tx_funder + a subsequent identity_best on that funder, narrate it: \"target is a fresh wallet; funded by `0xFUNDER…` which resolves to **<handle>** on <source>\".",
    "- If the funder is a known CEX (contract_name = Binance/Bybit/etc), say so — that's a KYC dead-end.",
    "",
    "TONE:",
    "- If you have a concrete answer with a handle, lead with confidence: \"**`0x...` is `Shiny11111` (OpenSea)** — they deployed this contract on `<date>`.\"",
    "- If you don't, be specific about WHAT you tried and WHY it's a dead-end, not vague."
  ].join("\n");
}

function renderAuditSynthSystem(): string {
  return [
    "You are the AUDIT SYNTHESIZER of {s}hinyAudit — a senior Solidity security auditor.",
    "Somnia testnet (chain id 50312).",
    "",
    "LANGUAGE RULE — reply in the user's language (English / Russian / etc).",
    "",
    "Read the full history. You have:",
    "- The contract source (or its absence)",
    "- Contract treasury balance, recent method ids, possibly ABI",
    "- Possibly contract_name results for related addresses (multi-contract platforms)",
    "- Possibly web research (VRF / oracle / liquidation params docs)",
    "",
    "STEP 0 — CLASSIFY THE CONTRACT before writing.",
    "Look at contract_name and source keywords and pick ONE primary category:",
    "  • casino / gambling / lottery (bet, dice, roulette, wheel, flip, raffle, lottery)",
    "  • dex / amm (swap, getReserves, addLiquidity, K invariant, Router, Pair, Pool)",
    "  • lending (borrow, repay, collateral, liquidate, debt, healthFactor)",
    "  • nft (ERC721, tokenURI, mint with payable, royalty, setApprovalForAll)",
    "  • staking (stake, unstake, lock, reward, claim, slash)",
    "  • bridge (relay, prove, claim, message, nonce, signature)",
    "  • governance (propose, vote, quorum, timelock, execute)",
    "  • multisig (signer, threshold, recovery, execTransaction)",
    "  • token / ERC20 (transfer, approve, mint, burn, decimals, totalSupply)",
    "  • payment / escrow (deposit, withdraw, refund, claim)",
    "  • factory / proxy (deploy, create, implementation, beacon)",
    "  • other / generic",
    "Pick MULTIPLE if the contract is hybrid (e.g. casino-token).",
    "",
    "Output ONLY markdown. Format STRICTLY:",
    "",
    "**Verdict:** <one bold sentence; overall risk: critical | high | medium | low | clean>",
    "**Risk score:** <0-100> / 100",
    "**Detected category:** <one or more from the list above>",
    "",
    "## Contract surface",
    "- `name` — contract_name",
    "- `compiler` — version",
    "- `is_proxy` — yes / no (and who can upgrade if yes)",
    "- `treasury balance` — convert wei→STT, 4 decimals",
    "- `recent activity` — the unique method ids seen and your best inference of purpose",
    "- `related contracts` — every other address you got contract_name on (oracle, factory, implementation, treasury, governance)",
    "",
    "## Universal vulnerability checklist (always run — 12 items)",
    "For each: ✓ safe · ⚠ caution · ✗ vulnerable · ? source unavailable. Cite function names from source.",
    "1. **Access control** — owner / role gates on privileged functions",
    "2. **Reentrancy** — external calls before state writes, missing nonReentrant",
    "3. **Withdraw flow** — owner-drainable? Time-locked? Multi-sig?",
    "4. **Pause / kill-switch** — single-key pause that traps user funds?",
    "5. **Upgrade / proxy** — who controls the implementation slot? Initialization protected?",
    "6. **Arithmetic** — Solidity ≥0.8 catches overflow; check `unchecked` blocks",
    "7. **Token approvals** — unlimited approvals granted to itself / unsafe spender",
    "8. **External dependencies** — every external call address (oracles, fee receivers, weth, etc) — is each one trusted/audited?",
    "9. **Event coverage** — critical state changes emit events for indexers/monitoring",
    "10. **Re-init / front-run init** — initializer protected from double-call?",
    "11. **Denial of service** — gas-griefing loops? Unbounded arrays? Push-vs-pull payments?",
    "12. **Signature handling** — if EIP-712/permit/meta-tx, replay protection (nonces, chainId, deadline)?",
    "",
    "## Category-specific sub-checklist (only the categories you detected)",
    "Run the matching block(s):",
    "",
    "**[casino/gambling]**",
    "- Randomness source: block.timestamp/blockhash/difficulty (BAD on Somnia — miners/validators see them) vs VRF / commit-reveal",
    "- MEV / frontrunning of public bet/settle functions",
    "- Bet caps, house-edge visible, payout solvency check",
    "",
    "**[dex/amm]**",
    "- Reserve manipulation / sandwich attack resistance",
    "- Fee math (rounding direction, taker vs maker)",
    "- Flash-loan price oracle if pools are used as oracles",
    "- K-invariant preservation on swap and addLiquidity",
    "",
    "**[lending]**",
    "- Oracle staleness check, fallback / circuit breaker",
    "- Liquidation incentive math, max LTV",
    "- Donation attack (transferring tokens directly to bypass exchange-rate)",
    "- Bad-debt accounting",
    "",
    "**[nft]**",
    "- Royalty (EIP-2981) enforced or bypassable on marketplace logic",
    "- Mint cap, per-wallet cap, signature mint replay",
    "- tokenURI tampering / metadata immutability",
    "- setApprovalForAll abuse",
    "",
    "**[staking]**",
    "- Reward math precision, dust accumulation",
    "- Unstake delay, slashing window, withdrawal queue",
    "- Reward token inflation through admin functions",
    "",
    "**[bridge]**",
    "- Signature validation: threshold, signer rotation, replay (nonce + chainId)",
    "- Withdrawal claim window, replayable claim",
    "- Trusted relayer compromise scenarios",
    "",
    "**[governance]**",
    "- Quorum / proposal threshold manipulation (flash-loan voting)",
    "- Timelock duration, executor authority",
    "- Proposal hijack via delegatecall on execute()",
    "",
    "**[multisig]**",
    "- Threshold change governance, recovery / removal of signers",
    "- Execution data validation (delegatecall risk)",
    "- nonce ordering",
    "",
    "**[token/ERC20]**",
    "- Max supply cap, owner mint, fee-on-transfer interactions with DEXes",
    "- Blacklist/blocklist (centralisation risk)",
    "- Permit / EIP-2612 replay",
    "",
    "**[payment/escrow]**",
    "- Refund race, finalisation conditions, escrow ownership",
    "- Force-receive (selfdestruct) state breakage",
    "",
    "**[factory/proxy]**",
    "- Implementation initialisation protection",
    "- Salt collision / deterministic deploy abuse",
    "- Admin / beacon controller",
    "",
    "## Critical findings (sorted by severity)",
    "Only the ⚠/✗ items, in priority order:",
    "- **[HIGH | MED | LOW]** Title",
    "  - Function / file: `name`",
    "  - Why it's a problem (1 sentence, technical)",
    "  - Concrete fix recommendation",
    "",
    "## Multi-contract dependencies",
    "List every related address you have contract_name for, plus any addresses in source you did NOT resolve — those are 'further audit needed' items.",
    "",
    "## Recommended next steps",
    "- 3–5 concrete tasks the founder should action before mainnet, ordered by impact.",
    "",
    "## Citations",
    "- Every tool call used (name, args, value snippet).",
    "",
    "ABSOLUTE rules:",
    "- NEVER invent function names — only cite those that appear literally in the source.",
    "- If source was empty / unverified, verdict MUST include `⚠ source not verified — bytecode-only audit is shallow`, most checklist items get '?', and the response leads with a recommendation to verify the contract on Shannon Explorer.",
    "- balances in wei → STT (÷10^18, 4 decimals).",
    "- This is a complementary automated audit — say so once at the bottom: it does not replace a formal manual audit by a security firm.",
    "- Be honest about gaps. Better to mark '?' than to guess."
  ].join("\n");
}

function renderSynthUser(
  prompt: string,
  target: string,
  history: Array<{ role: string; key: string; content: string }>,
  hint: string | null
): string {
  const lines: string[] = [];
  lines.push(`User question: ${prompt}`);
  lines.push(`Target: ${target}`);

  // ── DEFINITIVE-ANSWER INJECTION ──────────────────────────────
  // Server-side scan of the entire tool history for identity hits. If we
  // found a handle for ANY address, inject it as a hard-coded lead at the
  // TOP of the synth prompt — the LLM physically can't ignore something it
  // sees twice in 200 tokens. This is the brain-damage-proof identity rail.
  const hits = findIdentityHits(history);
  if (hits.length > 0) {
    lines.push("");
    lines.push("=== ⚡ DEFINITIVE FACTS — must appear in your Verdict ===");
    for (const h of hits) {
      lines.push(`• \`${h.addr}\` is **${h.handle}** on ${h.source.replace(/^identity_/, "").replace(/_handle$/, "").replace(/_resolved$/, "")}`);
    }
    lines.push("Lead your verdict with the strongest of these. NEVER say 'no identity found' — you literally have proof above.");
  }

  lines.push("");
  lines.push("=== Tool data collected ===");
  // Keep synth context small — cap each tool line at 180 chars, and only the
  // last 12 tool results. Larger context = slower LLM = consensus timeout.
  const toolLines = history.filter((h) => h.role === "tool");
  for (const h of toolLines.slice(-12)) {
    lines.push(h.content.slice(0, 180));
  }
  if (hint) {
    lines.push("");
    lines.push("=== Planner's draft answer (you can rewrite for clarity) ===");
    lines.push(hint.slice(0, 800));
  }
  lines.push("");
  lines.push("Compose the final markdown dossier now. Be concise.");
  return lines.join("\n");
}

function parsePlannerJson(raw: string): PlannerResponse {
  // The LLM sometimes wraps JSON in ```json fences or adds prose. Strip both.
  let s = raw.trim();
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) s = fenceMatch[1].trim();
  // Try to find the first top-level {...}
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1) s = s.slice(start, end + 1);
  return JSON.parse(s) as PlannerResponse;
}

function formatToolArgs(args: Record<string, string | number>): string {
  return Object.entries(args)
    .map(([k, v]) => `${k}=${typeof v === "string" && v.startsWith("0x") ? v.slice(0, 8) + "…" : v}`)
    .join(",");
}

// ---------- finalization polling ----------

/**
 * PRIMARY anti-hang signal: does the HTTP receipts API already have a usable
 * output for this request? The receipts API is the source of truth and is
 * immune to missed on-chain events — so polling it directly is what stops the
 * "request slot cleared, server may have missed the finalise event" hang.
 * Returns true if any consensus OR individual-validator output exists.
 */
async function peekReceiptReady(requestId: bigint, slug: AgentSlug): Promise<boolean> {
  try {
    // Reuse the existing receipts-API reader (function declaration → hoisted).
    // Returns the decoded output Hex when any validator result is published,
    // or undefined when nothing's available yet.
    const out = await fetchValidatorResult(requestId, PLATFORM_ADDRESS, slug);
    return out !== undefined;
  } catch {
    return false;
  }
}

async function waitForFinalization(
  requestId: bigint,
  fromBlock: bigint,
  timeoutSecs: number,
  slug?: AgentSlug
): Promise<{ status: ResponseStatus; finalizedBlock: bigint }> {
  const deadline = Date.now() + timeoutSecs * 1000;
  let cursor = fromBlock;
  let stateCheckCounter = 0;

  while (Date.now() < deadline) {
    const head = await publicClient.getBlockNumber();

    // (0) Receipts-API short-circuit — the most reliable signal. If the
    // result is already published, finalisation happened regardless of
    // whether our getLogs scan caught the event. Check from the 2nd poll.
    if (slug && stateCheckCounter >= 1 && (await peekReceiptReady(requestId, slug))) {
      return { status: "Success", finalizedBlock: head };
    }

    // Every ~5 polls, also probe getRequest() directly. If it reverts with
    // RequestNotFound, the slot was zeroed at finalisation → we missed the
    // event in our scan window. Treat that as terminal and return a
    // best-guess "Cleared" status.
    stateCheckCounter++;
    if (stateCheckCounter % 5 === 0) {
      try {
        await publicClient.readContract({
          address: PLATFORM_ADDRESS,
          abi: PLATFORM_ABI,
          functionName: "getRequest",
          args: [requestId]
        });
      } catch (err) {
        const msg = (err as Error).message || "";
        if (msg.includes("RequestNotFound") || msg.includes("reverted")) {
          // The slot is gone. Try to find the finalize event in a wider window
          // (last 5000 blocks) to recover the real status; if not found,
          // return "Failed" so the UI moves on.
          const recoverFrom = head > 5000n ? head - 5000n : 0n;
          for (let chunk = recoverFrom; chunk <= head; chunk += MAX_LOG_RANGE) {
            const to = chunk + MAX_LOG_RANGE - 1n > head ? head : chunk + MAX_LOG_RANGE - 1n;
            try {
              const logs = await publicClient.getLogs({
                address: PLATFORM_ADDRESS,
                event: FINALIZED_EVENT,
                args: { requestId },
                fromBlock: chunk,
                toBlock: to
              });
              if (logs.length > 0) {
                const log = logs[0];
                return {
                  status: RESPONSE_STATUS[Number(log.args.status)] ?? "None",
                  finalizedBlock: log.blockNumber!
                };
              }
            } catch { /* skip */ }
          }
          // event not found but slot is gone — the receipts API is the
          // tiebreaker: if it has output, finalisation succeeded; else Failed.
          if (slug && (await peekReceiptReady(requestId, slug))) {
            return { status: "Success", finalizedBlock: head };
          }
          return { status: "Failed", finalizedBlock: head };
        }
      }
    }

    if (cursor > head) {
      await sleep(1000);
      continue;
    }
    const to = cursor + MAX_LOG_RANGE - 1n > head ? head : cursor + MAX_LOG_RANGE - 1n;
    try {
      const logs = await publicClient.getLogs({
        address: PLATFORM_ADDRESS,
        event: FINALIZED_EVENT,
        args: { requestId },
        fromBlock: cursor,
        toBlock: to
      });
      if (logs.length > 0) {
        const log = logs[0];
        return {
          status: RESPONSE_STATUS[Number(log.args.status)] ?? "None",
          finalizedBlock: log.blockNumber!
        };
      }
    } catch {
      // RPC hiccup — advance anyway, don't get stuck
    }
    cursor = to + 1n;
    if (cursor > head) await sleep(1000);
  }
  throw new Error(`Timed out after ${timeoutSecs}s waiting for request ${requestId} to finalise`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function bigintReplacer(_k: string, v: unknown) {
  return typeof v === "bigint" ? v.toString() : v;
}

// ---------- HTTP receipts API ----------

interface ReceiptsIndex {
  contractAddress: string;
  requestId: string;
  receipts: string[];
  count: number;
}

interface ValidatorReceipt {
  requestId: string;
  status: string;          // "success" | "failed" | ...
  elapsedMs: number;
  agentReceipt?: {
    result?: string;       // 0x-prefixed ABI-encoded bytes
    bandwidthUsage?: unknown;
    llmUsage?: unknown;
    steps?: unknown[];
  };
}

/** Fetch validator receipts for a request and return the first ABI-encoded result. */
async function fetchValidatorResult(
  requestId: bigint,
  platform: `0x${string}`,
  _slug: AgentSlug,
  retries = 4
): Promise<Hex | undefined> {
  const indexUrl = `${RECEIPTS_BASE_URL}/agent-receipts?contractAddress=${platform.toLowerCase()}&requestId=${requestId}`;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const indexRes = await fetch(indexUrl, { cache: "no-store" });
      if (!indexRes.ok) throw new Error(`receipts index HTTP ${indexRes.status}`);
      const idx = (await indexRes.json()) as ReceiptsIndex;
      if (!idx.receipts || idx.receipts.length === 0) throw new Error("empty receipts index");

      // Walk the receipts in order, return the first successful agentReceipt.result.
      for (const url of idx.receipts) {
        try {
          const r = await fetch(url, { cache: "no-store" });
          if (!r.ok) continue;
          const rec = (await r.json()) as ValidatorReceipt;
          if (rec.status === "success" && rec.agentReceipt?.result) {
            return rec.agentReceipt.result as Hex;
          }
        } catch {
          /* try next */
        }
      }
      return undefined;
    } catch {
      await sleep(1000 * (attempt + 1));
    }
  }
  return undefined;
}

export { PLATFORM_ADDRESS };
