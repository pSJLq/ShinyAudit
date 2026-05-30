/**
 * /api/active — "most active contracts right now", from the real tx feed.
 *
 * There is NO Blockscout endpoint that ranks contracts by transaction count
 * over a time window — that is an analytical aggregation no explorer exposes
 * for free. So we compute it honestly: pull several pages of the live
 * transaction feed (/api/v2/transactions), tally how often each destination
 * contract appears, label the leaders, and report the sample window.
 *
 * This is a SAMPLE of the most recent N transactions, not an exact 10-day
 * count — and the summary says so. On a low-activity chain the sample covers
 * most of the activity anyway; on a busy chain it surfaces the current hot
 * contracts, which is what "what's active" really means.
 */
import { NextRequest } from "next/server";
import { EXPLORER_API } from "@/lib/somnia/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 30;

const V2 = EXPLORER_API.replace(/\/api$/, "/api/v2");

interface TxItem {
  to?: { hash?: string; name?: string | null; is_contract?: boolean } | null;
  method?: string | null;
  timestamp?: string;
}
interface TxPage { items?: TxItem[]; next_page_params?: Record<string, unknown> | null }

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pages = Math.min(Number(url.searchParams.get("pages") || "4"), 8); // up to ~8 pages
  const t = Date.now();

  // Walk the tx feed via pagination cursors.
  const tally = new Map<string, number>();
  const names = new Map<string, string>();
  const methods = new Map<string, Set<string>>();
  let sampled = 0;
  let oldest = "";
  let newest = "";
  let cursor: Record<string, unknown> | null = null;

  for (let pg = 0; pg < pages; pg++) {
    const qs = cursor
      ? "?" + Object.entries(cursor).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")
      : "";
    const page: TxPage | null = await fetchJson<TxPage>(`${V2}/transactions${qs}`);
    const items = page?.items || [];
    if (items.length === 0) break;
    if (pg === 0 && items[0]?.timestamp) newest = items[0].timestamp;
    for (const tx of items) {
      sampled++;
      if (tx.timestamp) oldest = tx.timestamp;
      const to = tx.to?.hash;
      if (!to || tx.to?.is_contract === false) continue; // only contract destinations
      tally.set(to, (tally.get(to) || 0) + 1);
      if (tx.to?.name) names.set(to, tx.to.name);
      if (tx.method) {
        if (!methods.has(to)) methods.set(to, new Set());
        methods.get(to)!.add(tx.method);
      }
    }
    cursor = page?.next_page_params || null;
    if (!cursor) break;
  }

  const ranked = [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([addr, hits], i) => ({
      rank: i + 1,
      address: addr,
      name: names.get(addr) || null,
      hits,
      methods: [...(methods.get(addr) || [])].slice(0, 3)
    }));

  // human window
  let windowMin: number | null = null;
  if (newest && oldest) {
    const dt = (Date.parse(newest) - Date.parse(oldest)) / 60000;
    if (Number.isFinite(dt) && dt >= 0) windowMin = dt;
  }
  const windowLabel =
    windowMin == null ? "recent" :
    windowMin < 90 ? `${windowMin.toFixed(0)} min` :
    windowMin < 1440 ? `${(windowMin / 60).toFixed(1)} h` :
    `${(windowMin / 1440).toFixed(1)} d`;

  const summary = ranked.length
    ? `most active contracts in the last ${sampled} txs (~${windowLabel}): ` +
      ranked.slice(0, 8).map((r) => `${r.name || r.address.slice(0, 10)} (${r.hits}x)`).join("; ")
    : `no contract calls in the last ${sampled} sampled txs — chain is very quiet right now`;

  return Response.json(
    {
      ok: true,
      elapsed_ms: Date.now() - t,
      sampled_txs: sampled,
      window: windowLabel,
      note: "ranking is over the most recent sampled transactions, not an exact calendar window — no explorer exposes a true time-windowed tx-count ranking without a dedicated indexer",
      summary: summary.slice(0, 480),
      top: ranked
    },
    { headers: { "cache-control": "public, max-age=30" } }
  );
}
