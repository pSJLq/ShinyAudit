/**
 * /api/events/[addr] — human-readable recent event feed for a contract.
 *
 * Blockscout already decodes many logs; we surface the most recent decoded
 * events as "EventName(arg=val, …)" so the agent can narrate what a contract
 * has been DOING (mints, swaps, transfers, ownership changes, pauses) without
 * reading raw topics.
 *
 * Returns "12 recent events: Transfer(…)×6; Approval(…)×3; OwnershipTransferred(…)".
 */
import { NextRequest } from "next/server";
import { EXPLORER_API } from "@/lib/somnia/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 30;

const V2 = EXPLORER_API.replace(/\/api$/, "/api/v2");

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

interface LogItem {
  topics?: string[];
  decoded?: {
    method_call?: string;
    parameters?: Array<{ name?: string; value?: string | number | boolean }>;
  } | null;
}

// fallback topic0 → name for the most common events
const KNOWN: Record<string, string> = {
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": "Transfer",
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": "Approval",
  "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31": "ApprovalForAll",
  "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0": "OwnershipTransferred",
  "0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1": "Sync",
  "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822": "Swap",
  "0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258": "Paused"
};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ addr: string }> }) {
  const { addr } = await ctx.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return Response.json({ ok: false, error: "invalid address", summary: "invalid address" }, { status: 200 });
  }
  const t = Date.now();
  const res = await fetchJson<{ items?: LogItem[] }>(`${V2}/addresses/${addr}/logs`);
  const items = res?.items || [];

  const counts = new Map<string, number>();
  const samples: string[] = [];
  for (const it of items) {
    const name = it.decoded?.method_call?.split("(")[0] || KNOWN[(it.topics?.[0] || "").toLowerCase()] || "Unknown";
    counts.set(name, (counts.get(name) || 0) + 1);
    if (samples.length < 4 && it.decoded?.parameters?.length) {
      const args = it.decoded.parameters
        .slice(0, 3)
        .map((p) => `${p.name}=${String(p.value).slice(0, 18)}`)
        .join(", ");
      samples.push(`${name}(${args})`);
    }
  }

  const tally = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const summary = items.length
    ? `${items.length} recent events: ` + tally.map(([n, c]) => `${n}×${c}`).join("; ") +
      (samples.length ? ` · e.g. ${samples[0]}` : "")
    : "no recent events emitted";

  return Response.json(
    {
      ok: true,
      address: addr,
      elapsed_ms: Date.now() - t,
      summary,
      event_counts: Object.fromEntries(tally),
      samples
    },
    { headers: { "cache-control": "public, max-age=30" } }
  );
}
