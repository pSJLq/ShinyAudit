/**
 * End-to-end smoke test of the full chat pipeline:
 *
 *   1. deposit 1.0 STT to ShinyAuditEscrow (the orchestrator EOA tops up its own credit)
 *   2. orchestrate a real swarm via the local /api/investigate SSE endpoint
 *   3. print every StreamEvent as it arrives
 *
 * Run:  node scripts/test-full-pipeline.mjs
 *
 * Prereqs: dev server running (`npm run dev`), .env populated.
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, defineChain, formatEther, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const REPO = process.cwd();
const NET = JSON.parse(readFileSync(resolve(REPO, "references/network-config.json"), "utf8")).testnet;
const ESCROW = JSON.parse(readFileSync(resolve(REPO, "lib/somnia/escrow-deployment.json"), "utf8"));

const chain = defineChain({
  id: NET.chainId,
  name: NET.network,
  nativeCurrency: NET.nativeCurrency,
  rpcUrls: { default: { http: [NET.rpcUrl] } }
});

const raw = process.env.PRIVATE_KEY;
if (!raw) throw new Error("PRIVATE_KEY missing");
const stripped = raw.startsWith("0x") ? raw.slice(2) : raw;
const account = privateKeyToAccount(`0x${stripped}`);
const publicClient = createPublicClient({ chain, transport: http(NET.rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(NET.rpcUrl) });

// --- ensure credit ---
async function ensureCredit(minSTT) {
  const want = parseEther(String(minSTT));
  const credit = await publicClient.readContract({
    address: ESCROW.address,
    abi: ESCROW.abi,
    functionName: "credits",
    args: [account.address]
  });
  console.log(`> credit on escrow: ${formatEther(credit)} STT`);
  if (credit >= want) {
    console.log("  ✓ enough — skipping deposit");
    return;
  }
  const topup = want - credit;
  console.log(`  depositing ${formatEther(topup)} STT…`);
  // Somnia testnet seems to require generous gas — estimate + 30% buffer.
  const gasEst = await publicClient.estimateContractGas({
    address: ESCROW.address,
    abi: ESCROW.abi,
    functionName: "deposit",
    args: [],
    value: topup,
    account: account.address
  });
  console.log(`  estimated gas: ${gasEst}`);
  const hash = await walletClient.writeContract({
    address: ESCROW.address,
    abi: ESCROW.abi,
    functionName: "deposit",
    args: [],
    value: topup,
    gas: (gasEst * 130n) / 100n
  });
  console.log(`  tx: ${hash}`);
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  ✓ deposited`);
}

// --- stream investigation via local API using raw node:http (no fetch timeout) ---
async function runInvestigation(prompt, target) {
  console.log(`\n> POST /api/investigate`);
  console.log(`  prompt: ${prompt}`);
  console.log(`  target: ${target}`);
  console.log(`  user:   ${account.address}\n`);

  const http = await import("node:http");
  const body = JSON.stringify({ prompt, target, user: account.address });
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method: "POST",
        host: "127.0.0.1",
        port: 3000,
        path: "/api/investigate",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          accept: "text/event-stream"
        }
      },
      (res) => {
        if (res.statusCode !== 200) {
          let txt = "";
          res.on("data", (c) => (txt += c.toString()));
          res.on("end", () => {
            console.error("HTTP error:", res.statusCode, txt);
            reject(new Error("HTTP " + res.statusCode));
          });
          return;
        }
        let buf = "";
        res.on("data", (chunk) => {
          buf += chunk.toString("utf8");
          let idx;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const line = block.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              printEvent(ev);
            } catch {
              console.warn("bad event", block);
            }
          }
        });
        res.on("end", resolve);
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(0); // no timeout
    req.write(body);
    req.end();
  });
}

function printEvent(ev) {
  const ts = new Date().toISOString().slice(11, 19);
  switch (ev.type) {
    case "quote":
      console.log(`[${ts}] quote     agents=${ev.agents.toFixed(4)} service=${ev.service.toFixed(4)} total=${ev.total.toFixed(4)} STT`);
      break;
    case "plan":
      console.log(`[${ts}] plan      ${ev.steps.map((s) => `${s.id}(${s.slug})`).join(" → ")}`);
      break;
    case "started":
      console.log(`[${ts}] started   ${ev.stepId} → ${ev.slug}.${ev.fnName}`);
      break;
    case "log":
      console.log(`[${ts}] log       ${ev.stepId}: ${ev.line}`);
      break;
    case "txhash":
      console.log(`[${ts}] tx        ${ev.stepId} ${ev.hash}`);
      break;
    case "request":
      console.log(`[${ts}] request   ${ev.stepId} requestId=${ev.requestId} deposit=${ev.deposit} STT`);
      console.log(`                       receipt → ${ev.receiptUrl}`);
      break;
    case "finalized":
      console.log(`[${ts}] finalized ${ev.stepId} ${ev.status} @block ${ev.finalizedBlock}`);
      break;
    case "result":
      console.log(`[${ts}] result    ${ev.stepId} ${ev.output.length > 80 ? ev.output.slice(0, 80) + "…" : ev.output}`);
      break;
    case "dossier":
      console.log(`\n[${ts}] DOSSIER (${ev.cost})`);
      console.log("─────────────────────────────────────");
      console.log(ev.markdown);
      console.log("─────────────────────────────────────");
      if (ev.flagged.length) {
        console.log(`flagged: ${ev.flagged.length} items`);
        for (const f of ev.flagged) console.log(`  [${f.severity}] ${f.title}`);
      }
      console.log(`citations: ${ev.citations.length}`);
      break;
    case "error":
      console.log(`[${ts}] ERROR     ${ev.stepId ? ev.stepId + ": " : ""}${ev.message}`);
      break;
    case "done":
      console.log(`[${ts}] done`);
      break;
    default:
      console.log(`[${ts}] ${ev.type}`, ev);
  }
}

const PROMPT = process.env.TEST_PROMPT || "/audit 0x4be0ddfebca9a5a4a617dee4dece99e7c862dceb explain in plain words what this contract does";
const TARGET = process.env.TEST_TARGET || "0x4be0ddfebca9a5a4a617dee4dece99e7c862dceb";

await ensureCredit(3.0);
await runInvestigation(PROMPT, TARGET);
console.log("\n✓ pipeline complete");
