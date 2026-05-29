/**
 * /api/upgrades/[addr] — proxy upgrade history & current implementation.
 *
 * "Is this upgradeable, who controls it, and has the logic changed?" Reads:
 *   • EIP-1967 implementation + admin slots (current logic + who can swap it)
 *   • Upgraded(address) event history from the proxy (each logic change)
 *   • whether the admin is an EOA (1-key risk) or a contract (timelock/multisig)
 *
 * Returns "proxy · impl=0xLOGIC (Vault v2) · admin=0xADMIN (EOA ⚠) · 2 upgrades".
 */
import { NextRequest } from "next/server";
import { createPublicClient, http, type Hex } from "viem";
import { EXPLORER_API } from "@/lib/somnia/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 120;

const client = createPublicClient({ transport: http("https://api.infra.testnet.somnia.network/") });
const V2 = EXPLORER_API.replace(/\/api$/, "/api/v2");
const IMPL_SLOT: Hex = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ADMIN_SLOT: Hex = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const UPGRADED_TOPIC = "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b"; // Upgraded(address)

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}
function slotAddr(word?: string | null): string | null {
  if (!word) return null;
  const h = word.slice(2).padStart(64, "0");
  if (/^0+$/.test(h)) return null;
  return "0x" + h.slice(24);
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ addr: string }> }) {
  const { addr } = await ctx.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return Response.json({ ok: false, error: "invalid address", summary: "invalid address" }, { status: 200 });
  }
  const t = Date.now();

  const [implWord, adminWord, logs] = await Promise.all([
    client.getStorageAt({ address: addr as Hex, slot: IMPL_SLOT }).catch(() => undefined),
    client.getStorageAt({ address: addr as Hex, slot: ADMIN_SLOT }).catch(() => undefined),
    fetchJson<{ items?: Array<{ topics?: string[] }> }>(`${V2}/addresses/${addr}/logs`)
  ]);

  const impl = slotAddr(implWord);
  const admin = slotAddr(adminWord);

  if (!impl) {
    return Response.json(
      { ok: true, address: addr, summary: "not an EIP-1967 proxy (no implementation slot) — likely a regular contract", is_proxy: false },
      { headers: { "cache-control": "public, max-age=120" } }
    );
  }

  // count Upgraded events
  const upgradeEvents = (logs?.items || []).filter((l) => (l.topics?.[0] || "").toLowerCase() === UPGRADED_TOPIC).length;

  // label impl + classify admin
  const [implSc, adminInfo] = await Promise.all([
    fetchJson<{ name?: string | null }>(`${V2}/smart-contracts/${impl}`),
    admin ? fetchJson<{ is_contract?: boolean; name?: string | null }>(`${V2}/addresses/${admin}`) : Promise.resolve(null)
  ]);

  const implName = implSc?.name ? ` (${implSc.name})` : "";
  const adminKind = adminInfo?.is_contract ? "contract (timelock/multisig possible)" : "EOA ⚠ single-key upgrade control";
  const adminName = adminInfo?.name ? ` "${adminInfo.name}"` : "";

  const summary =
    `EIP-1967 proxy · impl=${impl.slice(0, 10)}…${implName} · admin=${admin ? admin.slice(0, 10) + "…" + adminName : "unknown"} (${admin ? adminKind : "?"}) · ${upgradeEvents} upgrade event(s)`;

  return Response.json(
    {
      ok: true, address: addr, elapsed_ms: Date.now() - t, is_proxy: true,
      summary: summary.slice(0, 480),
      implementation: impl, implementation_name: implSc?.name || null,
      admin, admin_is_contract: adminInfo?.is_contract ?? null, admin_name: adminInfo?.name || null,
      upgrade_events: upgradeEvents
    },
    { headers: { "cache-control": "public, max-age=120" } }
  );
}
