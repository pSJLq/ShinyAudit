/**
 * Somnia Agents — typed wrappers over the three Phase-1 base agents.
 *
 * Source of truth: references/agents.json (mirrored from emrestay/somnia-agents-skills).
 * Network config:  references/network-config.json
 * Platform ABI:    references/abi/AgentRequester.json
 */

import { encodeFunctionData, type Abi, type AbiFunction, type Hex } from "viem";

import AGENTS_FILE from "@/references/agents.json";
import NETWORKS_FILE from "@/references/network-config.json";
import PLATFORM_ABI_FILE from "@/references/abi/AgentRequester.json";

// ---------- exports ----------
export const PLATFORM_ABI = PLATFORM_ABI_FILE as Abi;

export const NETWORKS = NETWORKS_FILE as {
  mainnet: NetworkEntry;
  testnet: NetworkEntry;
};

export interface NetworkEntry {
  network: string;
  chainId: number;
  rpcUrl: string;
  wsUrl?: string;
  explorerUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  agentExplorerUrl: string;
  receiptsBaseUrl: string;
  faucets?: string[];
  contracts: { SomniaAgents: `0x${string}`; AgentRegistry: `0x${string}` };
}

export interface AgentManifest {
  agentId: string; // decimal string of uint256
  name: string;
  description: string;
  pricePerAgent: string; // whole token, e.g. "0.03"
  consensusHint: "majority" | "threshold";
  abi: AbiFunction[];
}

export const AGENTS = (AGENTS_FILE as unknown as { agents: Record<string, AgentManifest> }).agents;

// Convenience constants — slug-keyed
export const AGENT_SLUG = {
  JSON_FETCH: "json-fetch",
  LLM_INFERENCE: "llm-inference",
  LLM_PARSE_WEBSITE: "llm-parse-website"
} as const;

export type AgentSlug = (typeof AGENT_SLUG)[keyof typeof AGENT_SLUG];

// ---------- payload encoders ----------
export function encodeAgentCall(slug: AgentSlug, fnName: string, args: unknown[]): Hex {
  const m = AGENTS[slug];
  if (!m) throw new Error(`Unknown agent slug: ${slug}`);
  const fn = m.abi.find((e) => e.type === "function" && e.name === fnName);
  if (!fn) throw new Error(`Function ${fnName} not in ABI for ${slug}`);
  return encodeFunctionData({ abi: m.abi as Abi, functionName: fnName, args });
}

export function getAgentAbi(slug: AgentSlug): AbiFunction[] {
  return AGENTS[slug].abi;
}

export function getAgentId(slug: AgentSlug): bigint {
  return BigInt(AGENTS[slug].agentId);
}

// ---------- typed helpers ----------

// json-fetch
export function encodeJsonFetchString(url: string, selector: string): Hex {
  return encodeAgentCall(AGENT_SLUG.JSON_FETCH, "fetchString", [url, selector]);
}
export function encodeJsonFetchUint(url: string, selector: string, decimals: number): Hex {
  return encodeAgentCall(AGENT_SLUG.JSON_FETCH, "fetchUint", [url, selector, decimals]);
}
export function encodeJsonFetchStringArray(url: string, selector: string): Hex {
  return encodeAgentCall(AGENT_SLUG.JSON_FETCH, "fetchStringArray", [url, selector]);
}

// llm-inference
export interface InferStringArgs {
  prompt: string;
  system?: string;
  chainOfThought?: boolean;
  allowedValues?: string[];
}
export function encodeInferString(args: InferStringArgs): Hex {
  return encodeAgentCall(AGENT_SLUG.LLM_INFERENCE, "inferString", [
    args.prompt,
    args.system ?? "",
    args.chainOfThought ?? true,
    args.allowedValues ?? []
  ]);
}

export interface InferNumberArgs {
  prompt: string;
  system?: string;
  minValue: bigint;
  maxValue: bigint;
  chainOfThought?: boolean;
}
export function encodeInferNumber(args: InferNumberArgs): Hex {
  return encodeAgentCall(AGENT_SLUG.LLM_INFERENCE, "inferNumber", [
    args.prompt,
    args.system ?? "",
    args.minValue,
    args.maxValue,
    args.chainOfThought ?? false
  ]);
}

// llm-parse-website
export interface ExtractStringArgs {
  key: string;
  description: string;
  options?: string[];
  prompt: string;
  url: string;
  resolveUrl?: boolean;
  numPages?: number;
}
export function encodeExtractString(args: ExtractStringArgs): Hex {
  return encodeAgentCall(AGENT_SLUG.LLM_PARSE_WEBSITE, "ExtractString", [
    args.key,
    args.description,
    args.options ?? [],
    args.prompt,
    args.url,
    args.resolveUrl ?? false,
    args.numPages ?? 1
  ]);
}

export interface ExtractNumberArgs {
  key: string;
  description: string;
  min: bigint;
  max: bigint;
  prompt: string;
  url: string;
  resolveUrl?: boolean;
  numPages?: number;
}
export function encodeExtractNumber(args: ExtractNumberArgs): Hex {
  return encodeAgentCall(AGENT_SLUG.LLM_PARSE_WEBSITE, "ExtractANumber", [
    args.key,
    args.description,
    args.min,
    args.max,
    args.prompt,
    args.url,
    args.resolveUrl ?? false,
    args.numPages ?? 1
  ]);
}
