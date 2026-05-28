/**
 * /api/identity/[addr] — aggregator of public web-3 identity sources.
 *
 * Why this exists: the on-chain `llm-parse-website` agent calls 3 validators
 * who scrape the same page independently. Dynamic JS rendering means each
 * validator sees a slightly different snapshot → consensus fails → tool
 * returns "(failed)". This route flips the model: WE do the scraping
 * server-side once, normalise the result into deterministic JSON, and the
 * Somnia json-fetch agent's 3 validators all hit the same URL and see the
 * same bytes — consensus succeeds.
 *
 * Sources probed in parallel (all public, no API key):
 *   • OpenSea profile HTML → username regex
 *   • ENSIdeas (api.ensideas.com) → primary ENS name
 *   • ENS subgraph → all ENS domains owned/resolved-to
 *   • Mirror.xyz HTML → wallet handle
 *   • Warpcast Hub  → Farcaster username (if public hub allows)
 *   • Lens v2 GraphQL → handle
 *   • Galxe address → username (HTML scrape)
 *
 * Returns: { ok, address, results: { source → value|null }, hits: number }
 *
 * NOTE on deployment: validators reach this via HTTPS. In production set
 * NEXT_PUBLIC_BASE_URL to the deployed origin (e.g. https://shinyaudit.xyz);
 * in dev expose via cloudflared/ngrok tunnel and set that as BASE_URL.
 */

import { NextRequest } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Cache results 5 min so concurrent validator requests see identical bytes.
export const revalidate = 300;

interface ProbeResult {
  source: string;
  value: string | null;
  ms: number;
  detail?: string;
}

const UA_REAL = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const TIMEOUT_MS = 8000;
const execFileAsync = promisify(execFile);

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  // AbortSignal.timeout aborts even if TLS handshake is hanging — superior to
  // manual AbortController for slow-failing endpoints.
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
}

/**
 * curl-as-fetch — OpenSea / Galxe / Mirror block Node's undici fetch (TLS
 * fingerprint detection). curl gets through because it's a real browser-class
 * UA at the network layer. We pay one process-spawn (~30 ms) per call.
 */
async function curlGet(url: string, ua = UA_REAL, timeoutSec = 10): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "curl",
      ["-sL", "--max-time", String(timeoutSec), "-A", ua, "--compressed", url],
      { encoding: "utf8", maxBuffer: 8_000_000 }
    );
    return stdout || null;
  } catch {
    return null;
  }
}

async function probe(source: string, fn: () => Promise<string | null>): Promise<ProbeResult> {
  const t = Date.now();
  try {
    const v = await fn();
    return { source, value: v, ms: Date.now() - t };
  } catch (e) {
    return { source, value: null, ms: Date.now() - t, detail: (e as Error).message.slice(0, 100) };
  }
}

// ── individual probes ──────────────────────────────────────────────

async function probeOpenSea(addr: string): Promise<string | null> {
  // Node's undici fetch is fingerprint-blocked by OpenSea. Use curl child.
  const html = await curlGet(`https://opensea.io/${addr}`);
  if (!html) return null;
  const m = html.match(/"username":"([^"]+)"/);
  return m && m[1] && m[1] !== "null" ? m[1] : null;
}

async function probeENSIdeas(addr: string): Promise<string | null> {
  const r = await fetchWithTimeout(`https://api.ensideas.com/ens/resolve/${addr}`, { headers: { accept: "application/json" } });
  if (!r.ok) return null;
  const j = (await r.json()) as { name?: string | null };
  return j.name || null;
}

async function probeENSSubgraph(addr: string): Promise<string | null> {
  const body = JSON.stringify({
    query: `{ domains(where: { resolvedAddress: "${addr.toLowerCase()}" }, first: 5) { name } }`
  });
  // Subgraph hosted service has been deprecated; use curl for the network-level
  // headers + redirect handling consistency.
  try {
    const { stdout } = await execFileAsync(
      "curl",
      ["-sL", "--max-time", "8", "-H", "content-type: application/json", "-d", body, "https://api.thegraph.com/subgraphs/name/ensdomains/ens"],
      { encoding: "utf8", maxBuffer: 2_000_000 }
    );
    const j = JSON.parse(stdout) as { data?: { domains?: Array<{ name: string }> } };
    const names = j.data?.domains?.map((d) => d.name).filter(Boolean) || [];
    return names.length ? names.join(",") : null;
  } catch {
    return null;
  }
}

async function probeFarcasterByAddress(addr: string): Promise<string | null> {
  // Warpcast's public hub. Many deployments require API key now — best-effort.
  const html = await curlGet(`https://api.warpcast.com/v2/user-by-verification?address=${addr}`, UA_REAL, 6);
  if (!html) return null;
  try {
    const j = JSON.parse(html) as { result?: { user?: { username?: string } } };
    return j.result?.user?.username || null;
  } catch {
    return null;
  }
}

async function probeLens(addr: string): Promise<string | null> {
  // Lens v3 GraphQL — requires Origin header and proper accept type.
  const body = JSON.stringify({
    query: `query { accounts(request: { filter: { owner: { address: "${addr}" } }, pageSize: TEN }) { items { username { localName fullHandle } } } }`
  });
  try {
    const { stdout } = await execFileAsync(
      "curl",
      ["-sL", "--max-time", "8",
       "-H", "content-type: application/json",
       "-H", "origin: https://hey.xyz",
       "-d", body,
       "https://api.lens.xyz/graphql"],
      { encoding: "utf8", maxBuffer: 2_000_000 }
    );
    const j = JSON.parse(stdout) as { data?: { accounts?: { items?: Array<{ username?: { fullHandle?: string; localName?: string } }> } } };
    const items = j.data?.accounts?.items || [];
    const handles = items.map((i) => i.username?.fullHandle || i.username?.localName).filter(Boolean) as string[];
    return handles.length ? handles.join(",") : null;
  } catch {
    return null;
  }
}

async function probeMirror(addr: string): Promise<string | null> {
  // mirror.xyz/<addr> — SSR pages embed display data.
  const html = await curlGet(`https://mirror.xyz/${addr}`, UA_REAL, 8);
  if (!html) return null;
  const m =
    html.match(/"displayName":"([^"]+)"/) ||
    html.match(/<title>([^<|]+?)\s*[|—]/) ||
    html.match(/"ensLabel":"([^"]+)"/);
  const v = m?.[1]?.trim();
  return v && v.length > 0 && v.toLowerCase() !== "mirror" ? v : null;
}

async function probeGalxe(addr: string): Promise<string | null> {
  const html = await curlGet(`https://galxe.com/${addr}`, UA_REAL, 8);
  if (!html) return null;
  const m = html.match(/"username":"([^"]+)"/);
  return m && m[1] && m[1] !== "null" ? m[1] : null;
}

// ── handler ────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, ctx: { params: Promise<{ addr: string }> }) {
  const { addr } = await ctx.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return json({ ok: false, error: "invalid address" }, 400);
  }
  const lower = addr.toLowerCase();
  const probes = await Promise.all([
    probe("opensea",       () => probeOpenSea(addr)),
    probe("ensideas",      () => probeENSIdeas(addr)),
    probe("ens_subgraph",  () => probeENSSubgraph(lower)),
    probe("farcaster",     () => probeFarcasterByAddress(addr)),
    probe("lens",          () => probeLens(addr)),
    probe("mirror",        () => probeMirror(addr)),
    probe("galxe",         () => probeGalxe(addr))
  ]);

  const results: Record<string, string | null> = {};
  let hits = 0;
  for (const p of probes) {
    results[p.source] = p.value;
    if (p.value) hits++;
  }

  // Aggregate "best guess" identity. Priority: ENS > OpenSea > Lens > Farcaster > Mirror > Galxe.
  const best =
    results.ensideas      ||
    results.ens_subgraph  ||
    results.opensea       ||
    results.lens          ||
    results.farcaster     ||
    results.mirror        ||
    results.galxe         ||
    null;

  // Compact summary — for on-chain fetchString with selector="summary".
  // Single small string the Somnia validator consensus converges on fast.
  // "Shiny11111 (opensea); vitalik.eth (ensideas)" or "none on 7 sources".
  const hitParts: string[] = [];
  for (const [src, val] of Object.entries(results)) {
    if (val) hitParts.push(`${val} (${src})`);
  }
  const summary = hitParts.length ? hitParts.join("; ") : "none on 7 sources";

  return json({
    ok: true,
    address: addr,
    hits,
    best,
    summary,
    results,
    probes: probes.map((p) => ({ source: p.source, ms: p.ms, ok: p.value != null, detail: p.detail }))
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=300" }
  });
}
