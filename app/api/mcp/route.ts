/**
 * MCP (Model Context Protocol) endpoint for {s}hinyAudit's tool catalogue.
 *
 * Exposes our on-chain investigator tools as MCP tools so Somnia's
 * `inferToolsChat` agent (or any MCP-compatible LLM client like Claude
 * Desktop) can call them in a self-driven loop:
 *
 *   POST /api/mcp
 *   { "jsonrpc": "2.0", "method": "tools/list", "id": 1 }
 *   { "jsonrpc": "2.0", "method": "tools/call", "params": { "name": "...", "arguments": {...} }, "id": 2 }
 *
 * For inferToolsChat to use this endpoint, the URL must be publicly
 * reachable from Somnia validators. Pass the production URL like
 * "https://shinyaudit.xyz/api/mcp" in the mcpServerUrls array.
 *
 * Spec: https://modelcontextprotocol.io
 */

import { NextRequest } from "next/server";
import { TOOLS, TOOL_BY_NAME, type BuiltTool } from "@/lib/somnia/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const TOOLS_LIST = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: {
    type: "object",
    properties: Object.fromEntries(
      Object.entries(t.args).map(([k, v]) => [k, { type: "string", description: v }])
    ),
    required: Object.keys(t.args)
  }
}));

const SERVER_INFO = {
  name: "shinyaudit-mcp",
  version: "0.1.0"
};

const SERVER_CAPABILITIES = {
  tools: { listChanged: false }
};

function ok(id: JsonRpcResponse["id"], result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}
function err(id: JsonRpcResponse["id"], code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

async function executeBuilt(built: BuiltTool): Promise<string> {
  switch (built.kind) {
    case "fetchString":
    case "fetchUint":
    case "fetchBool": {
      // MCP path: fetch the URL ourselves and extract via dot-notation.
      // This serves MCP clients (Claude Desktop, third-party agents) instantly.
      // For on-chain receipts, the user should call /api/investigate which
      // dispatches the SAME tool via Somnia's json-fetch agent.
      const res = await fetch(built.url, { headers: { Accept: "application/json" }, cache: "no-store" });
      const json = await res.json();
      return String(getByPath(json, built.selector) ?? "");
    }
    case "ExtractString":
      throw new Error("ExtractString requires the on-chain llm-parse-website agent; call via /api/investigate instead.");
    case "ExtractANumber":
      throw new Error("ExtractANumber requires the on-chain llm-parse-website agent.");
    case "composite": {
      // Composite over off-chain fetches: run sub-steps in PARALLEL here (no
      // nonce constraint — these are plain HTTP). Returns "label1=val1 | …".
      // (The on-chain path in orchestrator.ts runs them sequentially because
      // an EOA can't parallel-sign.)
      const results = await Promise.all(
        built.steps.map(async (s) => {
          try {
            const v = await executeBuilt(s.sub);
            return `${s.label}=${v.slice(0, 200)}`;
          } catch (e) {
            return `${s.label}=(failed: ${(e as Error).message.slice(0, 60)})`;
          }
        })
      );
      return results.join(" | ");
    }
  }
}

function getByPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) => (acc != null && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
      obj
    );
}

async function dispatch(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { id = null, method, params } = req;
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: "2024-11-05",
      capabilities: SERVER_CAPABILITIES,
      serverInfo: SERVER_INFO
    });
  }
  if (method === "tools/list") {
    return ok(id, { tools: TOOLS_LIST });
  }
  if (method === "tools/call") {
    const name = (params?.name ?? "") as string;
    const args = (params?.arguments ?? {}) as Record<string, string | number>;
    const spec = TOOL_BY_NAME[name];
    if (!spec) return err(id, -32601, `Unknown tool: ${name}`);
    try {
      const built = spec.build(args);
      const output = await executeBuilt(built);
      return ok(id, {
        content: [{ type: "text", text: output }],
        isError: false
      });
    } catch (e) {
      // Strip viem's verbose Raw Call dump — return only the essence.
      const raw = (e as Error).message || String(e);
      const short = raw.split("\n")[0].replace(/^Error: /, "").slice(0, 240);
      return ok(id, {
        content: [{ type: "text", text: `tool reverted: ${short}` }],
        isError: true
      });
    }
  }
  if (method === "ping") return ok(id, {});
  if (method === "notifications/initialized") return ok(id, {});
  return err(id, -32601, `Unknown method: ${method}`);
}

export async function POST(req: NextRequest) {
  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = (await req.json()) as JsonRpcRequest | JsonRpcRequest[];
  } catch {
    return new Response(JSON.stringify(err(null, -32700, "Parse error")), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }

  const responses = Array.isArray(body) ? await Promise.all(body.map(dispatch)) : await dispatch(body);
  return new Response(JSON.stringify(responses), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

// GET for browser inspection — returns capability summary.
export async function GET() {
  return new Response(
    JSON.stringify(
      {
        server: SERVER_INFO,
        capabilities: SERVER_CAPABILITIES,
        protocol: "MCP / JSON-RPC 2.0",
        endpoint: "POST /api/mcp",
        toolCount: TOOLS_LIST.length,
        tools: TOOLS_LIST.map((t) => t.name)
      },
      null,
      2
    ),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
