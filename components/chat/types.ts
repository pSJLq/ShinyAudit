/**
 * Types for the chat UI — messages, blocks, sessions.
 *
 * Block schema mirrors what the orchestrator's `synthesizer` agent must emit
 * inside its result JSON. See lib/somnia/orchestrator.ts for the prompt that
 * constrains the LLM to this shape.
 */

import type { StreamEvent } from "@/lib/investigate-client";

export type Severity = "high" | "med" | "low";
export type VerdictTone = "lime" | "amber" | "red" | "purple";
export type VerdictGlyphKind = "shield" | "wallet" | "flow" | "token" | "bell" | "s";

export type AgentStatus = "queued" | "running" | "done" | "error";

export interface AgentStepRender {
  id: string;
  name: string;
  slug: string;
  status: AgentStatus;
  meta: string;
  logs: AgentLog[];
  /** Somnia request id (decimal string) — set after `request` SSE event */
  requestId?: string;
  /** block at which our createRequest tx landed (for "N blocks elapsed" counter) */
  startBlock?: string;
}

export interface AgentLog {
  txt: string;
  receipt?: string | null;
}

export interface CodeLine {
  tokens: Array<[string, string]>;
}

export type KVValue =
  | string
  | { v: string }
  | { chip: "addr" | "tx"; v: string; tag?: string };

export interface RiskItem {
  sev: Severity;
  title: string;
  desc: string;
  ref?: { txt: string; tx?: string };
  aside?: string;
}

export type Block =
  | { type: "markdown"; text: string }
  | { type: "code"; lang: string; title?: string; lines: CodeLine[] }
  | { type: "kv-table"; rows: Array<[string, KVValue]> }
  | {
      type: "risk-list";
      hasViewToggle?: boolean;
      items?: RiskItem[];
      itemsByView?: { user: RiskItem[]; founder: RiskItem[] };
    }
  | { type: "callout"; level: "info" | "warn" | "danger"; sym?: string; text: string }
  | { type: "sankey"; title?: string; data?: SankeyData };

export interface SankeyNode {
  id: string;
  label: string;
  sub?: string;
  color?: string;
}

export interface SankeyLink {
  from: string;
  to: string;
  value: number;
  color?: string;
}

export interface SankeyData {
  columns: Array<{ label: string; nodes: SankeyNode[] }>;
  links: SankeyLink[];
}

export interface Verdict {
  tone: VerdictTone;
  glyph: VerdictGlyphKind;
  label: string;
  headline: string;
  score?: number;
  scoreLabel?: string;
}

export interface Citation {
  hash: string;
  agent: string;
  what: string;
  consensus?: string;
  receipt: string;
}

export type MessageStatus = "planning" | "streaming" | "done" | "error";

export interface UserMsg {
  id: string;
  role: "user";
  text: string;
  target?: { kind: string; addr: string } | null;
  qtype?: string | null;
  costEst?: number;
}

export interface SwarmMsg {
  id: string;
  role: "swarm";
  status: MessageStatus;
  title: { kind: string; target: string };
  costTotal: number | null;
  agentsCost?: number | null;
  serviceCost?: number | null;
  sealed: boolean;
  duration: number | null;
  view?: "user" | "founder";
  agents: AgentStepRender[];
  verdict?: Verdict | null;
  blocks: Block[];
  citations: Citation[];
  errorMessage?: string;
}

export type ChatMessage = UserMsg | SwarmMsg;

export interface ChatSession {
  id: string;
  startedAt: string;
  turns: number;
  credit: number;       // STT
  sessionTotal: number; // STT spent this session
  lastReply: number;    // last reply cost
}

export type SlashCommand = {
  cmd: string;
  desc: string;
  ex: string;
  qtype: string;
};

export type QuickstartTile = {
  cmd: string;
  name: string;
  hint: string;
  icon: string;
  ex: string;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: "/audit",   desc: "audit a verified contract for risk",         ex: "0xabc…",                  qtype: "audit" },
  { cmd: "/profile", desc: "behavioural fingerprint for a wallet",        ex: "0xdef… last 30 days",     qtype: "profile" },
  { cmd: "/trace",   desc: "follow fund flow N hops",                     ex: "0xdrop… 3 hops",          qtype: "trace" },
  { cmd: "/xray",    desc: "supply, concentration, hidden permissions",   ex: "0xtok…",                  qtype: "xray" },
  { cmd: "/stealth", desc: "find stealth deployments by a team",          ex: "@project / 0xdeployer",   qtype: "stealth" },
  { cmd: "/watch",   desc: "alert me if conditions trigger",              ex: "0xfoo… owner renounces",  qtype: "watch" }
];

// Real addresses that actually live on Somnia testnet — clicking these will
// produce real receipts. MultiCall3 is verified source, EntryPoint v0.7 is
// the canonical ERC-4337 entrypoint.
export const QUICKSTART_TILES: QuickstartTile[] = [
  { cmd: "/audit",   name: "audit a contract",         hint: "verified source · risk vectors",      icon: "◈", ex: "/audit 0x841b8199E6d3Db3C6f264f6C2bd8848b3cA64223 explain what MultiCall3 does and flag any privileged paths" },
  { cmd: "/profile", name: "profile a wallet",         hint: "recent activity fingerprint",         icon: "◉", ex: "/profile 0x02e1E0242d59A7E28859fC835Fc0869f9A6F2417 last 30 days" },
  { cmd: "/trace",   name: "trace fund flow",          hint: "N-hop chase, mixer detection",        icon: "↬", ex: "/trace 0x02e1E0242d59A7E28859fC835Fc0869f9A6F2417 3 hops" },
  { cmd: "/xray",    name: "x-ray the entrypoint",     hint: "ERC-4337 EntryPoint v0.7",            icon: "◐", ex: "/xray 0x0000000071727De22E5E9d8BAf0edAc6f37da032" },
  { cmd: "/stealth", name: "find stealth deployments", hint: "deployer wallet contract scan",       icon: "▥", ex: "/stealth 0x02e1E0242d59A7E28859fC835Fc0869f9A6F2417" },
  { cmd: "/watch",   name: "watch for changes",        hint: "on-chain alert in this thread",       icon: "◔", ex: "/watch 0x841b8199E6d3Db3C6f264f6C2bd8848b3cA64223 if owner renounces" }
];

export type { StreamEvent };
