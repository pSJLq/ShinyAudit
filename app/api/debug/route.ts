/**
 * /api/debug — dev-only inspector for the planner system prompt.
 *
 * Returns the rendered tool catalogue + framing per intent so we can
 * confirm the on-chain payload sent to inferString.system is under the
 * Somnia validator size budget (~8-10 KB).
 *
 * GET /api/debug              — sizes for every intent
 * GET /api/debug?intent=audit — full text of the audit-intent catalogue
 */

import { NextRequest } from "next/server";
import { TOOLS, renderToolsCatalogueFor } from "@/lib/somnia/tools";
import { encodeInferString } from "@/lib/somnia/agents";
import { renderPlannerSystemFor, renderAuditSynthSystemPublic } from "@/lib/somnia/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTENTS = ["audit", "profile", "trace", "xray", "watch", "stealth", "free"] as const;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const intent = url.searchParams.get("intent");

  if (intent) {
    const text = renderToolsCatalogueFor(intent);
    return new Response(text, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }

  // Build the full payload that actually goes on-chain for each intent and
  // measure both the system-text bytes AND the ABI-encoded hex length (this
  // is what the Somnia validator actually receives).
  const samplePrompt = "Кто владелец этого казино? 0xb17CE5D7bf4eCa28580368FaD1548C99D5a2545C — это контракт казино";
  const sampleTarget = "0xb17CE5D7bf4eCa28580368FaD1548C99D5a2545C";

  const sizes: Record<string, {
    catalogueBytes: number;
    catalogueLines: number;
    plannerSystemBytes: number;
    plannerAbiHexBytes: number;
    tools: string[];
  }> = {};

  for (const i of INTENTS) {
    const t = renderToolsCatalogueFor(i);
    const sys = renderPlannerSystemFor(samplePrompt, sampleTarget, i);
    const abiHex = encodeInferString({
      prompt: `Target: ${sampleTarget}\nQuestion: ${samplePrompt}`,
      system: sys,
      chainOfThought: true
    });
    sizes[i] = {
      catalogueBytes: Buffer.byteLength(t, "utf8"),
      catalogueLines: t.split("\n").length,
      plannerSystemBytes: Buffer.byteLength(sys, "utf8"),
      // hex string minus "0x" prefix, each hex byte = 2 chars
      plannerAbiHexBytes: (abiHex.length - 2) / 2,
      tools: t.split("\n").map((ln) => ln.split("(")[0])
    };
  }

  const auditSynthSys = renderAuditSynthSystemPublic();
  return new Response(
    JSON.stringify(
      {
        totalTools: TOOLS.length,
        auditSynthSystemBytes: Buffer.byteLength(auditSynthSys, "utf8"),
        perIntent: sizes
      },
      null,
      2
    ),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
