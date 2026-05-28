// Validate .env without leaking secrets. Run: node scripts/check-env.mjs
import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, formatEther } from "viem";

const RPC = process.env.NEXT_PUBLIC_SOMNIA_RPC || "https://api.infra.testnet.somnia.network/";
const CHAIN_ID = 50312;

const pk = process.env.PRIVATE_KEY;
const dep = process.env.DEPLOYER_ADDRESS;

const rows = [];
function row(label, ok, detail = "") {
  rows.push({ label, ok, detail });
}

row("PRIVATE_KEY present", !!pk);
const cleaned = pk ? (pk.startsWith("0x") ? pk.slice(2) : pk) : "";
row("PRIVATE_KEY hex length = 64", cleaned.length === 64, `(got ${cleaned.length})`);
row("PRIVATE_KEY only hex chars", /^[0-9a-fA-F]*$/.test(cleaned));

let derived = null;
try {
  if (cleaned.length === 64) {
    const normalised = ("0x" + cleaned);
    derived = privateKeyToAccount(normalised).address;
    row("PRIVATE_KEY parses to account", true);
  } else {
    row("PRIVATE_KEY parses to account", false, "skipped — fix length first");
  }
} catch (e) {
  row("PRIVATE_KEY parses to account", false, e.message);
}

row("DEPLOYER_ADDRESS present", !!dep);
row("DEPLOYER_ADDRESS has 0x prefix", !!dep && dep.startsWith("0x"));
row("DEPLOYER_ADDRESS length = 42", !!dep && dep.length === 42);
if (derived && dep) {
  const match = derived.toLowerCase() === dep.toLowerCase();
  row("DEPLOYER_ADDRESS matches PRIVATE_KEY", match, match ? "" : `(mismatch)`);
}

let balanceWei = null;
try {
  const client = createPublicClient({
    chain: { id: CHAIN_ID, name: "Somnia Testnet", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } },
    transport: http(RPC)
  });
  if (derived) {
    balanceWei = await client.getBalance({ address: derived });
    row("balance fetched from Somnia testnet", true, `${formatEther(balanceWei)} STT`);
  }
} catch (e) {
  row("balance fetched from Somnia testnet", false, e.message);
}

for (const c of rows) {
  console.log(`${c.ok ? "OK " : "FAIL"}  ${c.label}${c.detail ? "  " + c.detail : ""}`);
}

const failed = rows.some((c) => !c.ok);
process.exit(failed ? 1 : 0);
