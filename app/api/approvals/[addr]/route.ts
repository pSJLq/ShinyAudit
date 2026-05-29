/**
 * /api/approvals/[addr] — token-approval scanner (the #1 drain vector).
 *
 * "What has this wallet approved, and to whom?" — every hack post-mortem
 * starts here. We scan the wallet's token-transfer + log history via
 * Blockscout for Approval(owner, spender, value) and ApprovalForAll events,
 * then flag:
 *   • unlimited approvals (value == 2^256-1)
 *   • approvals to unverified / unnamed spenders (higher risk)
 *
 * Returns compact `summary`: "3 approvals · 1 UNLIMITED to 0xSPENDER (unverified)".
 */
import { NextRequest } from "next/server";
import { EXPLORER_API } from "@/lib/somnia/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 60;

const V2 = EXPLORER_API.replace(/\/api$/, "/api/v2");
const APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"; // Approval(address,address,uint256)
const APPROVAL_FOR_ALL = "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31"; // ApprovalForAll(address,address,bool)
const MAX_UINT = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

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
  address?: { hash?: string };
  topics?: string[];
  data?: string;
  decoded?: { method_call?: string; parameters?: Array<{ name?: string; value?: string }> };
}

function topicAddr(topic?: string): string | null {
  if (!topic || topic.length < 66) return null;
  return "0x" + topic.slice(-40);
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ addr: string }> }) {
  const { addr } = await ctx.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return Response.json({ ok: false, error: "invalid address", summary: "invalid address" }, { status: 200 });
  }
  const t = Date.now();
  const lower = addr.toLowerCase();
  // logs where this wallet is the approver (topic1 = owner)
  const res = await fetchJson<{ items?: LogItem[] }>(`${V2}/addresses/${addr}/logs`);
  const items = res?.items || [];

  interface Appr { token: string; spender: string; unlimited: boolean; forAll: boolean }
  const approvals: Appr[] = [];
  for (const it of items) {
    const topics = it.topics || [];
    const t0 = (topics[0] || "").toLowerCase();
    if (t0 !== APPROVAL_TOPIC && t0 !== APPROVAL_FOR_ALL) continue;
    const owner = topicAddr(topics[1]);
    if (!owner || owner.toLowerCase() !== lower) continue; // only THIS wallet's approvals
    const spender = topicAddr(topics[2]) || "unknown";
    const token = it.address?.hash || "unknown";
    if (t0 === APPROVAL_FOR_ALL) {
      const granted = !!it.data && /1$/.test(it.data);
      if (granted) approvals.push({ token, spender, unlimited: true, forAll: true });
    } else {
      const valHex = (it.data || "").slice(2).toLowerCase();
      const unlimited = valHex.includes(MAX_UINT);
      const nonZero = !!valHex && !/^0+$/.test(valHex);
      if (nonZero) approvals.push({ token, spender, unlimited, forAll: false });
    }
  }

  // Resolve spender names (best-effort, cap 5).
  const uniqueSpenders = [...new Set(approvals.map((a) => a.spender))].slice(0, 5);
  const names = new Map<string, string>();
  await Promise.all(
    uniqueSpenders.map(async (s) => {
      const a = await fetchJson<{ name?: string | null; is_verified?: boolean }>(`${V2}/smart-contracts/${s}`);
      if (a?.name) names.set(s, a.name);
    })
  );

  const unlimited = approvals.filter((a) => a.unlimited);
  const parts: string[] = [`${approvals.length} active approval(s)`];
  if (unlimited.length) {
    parts.push(
      `${unlimited.length} UNLIMITED: ` +
        unlimited
          .slice(0, 4)
          .map((a) => `${a.forAll ? "setApprovalForAll" : "max"}→${(names.get(a.spender) || a.spender.slice(0, 10)) }${names.has(a.spender) ? "" : " (unverified)"}`)
          .join(", ")
    );
  } else if (approvals.length) {
    parts.push("none unlimited");
  }
  const summary = approvals.length ? parts.join(" | ") : "no active token approvals found";

  return Response.json(
    {
      ok: true,
      address: addr,
      elapsed_ms: Date.now() - t,
      summary,
      total: approvals.length,
      unlimited: unlimited.length,
      approvals: approvals.slice(0, 20).map((a) => ({ ...a, spender_name: names.get(a.spender) || null }))
    },
    { headers: { "cache-control": "public, max-age=60" } }
  );
}
