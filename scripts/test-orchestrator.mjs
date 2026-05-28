/**
 * Direct test of the orchestrator (bypasses HTTP / SSE / Next.js dev timeout).
 * Imports lib/somnia/orchestrator.ts via tsx-style dynamic import.
 *
 * Run:  npx tsx scripts/test-orchestrator.ts
 *       (or pre-compile + node)
 *
 * We mirror the orchestrator logic inline so we don't need tsx.
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  decodeFunctionResult,
  defineChain,
  encodeFunctionData,
  formatEther,
  http,
  parseAbiItem,
  parseEther
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const REPO = process.cwd();
const r = (p) => resolve(REPO, p);
const NET = JSON.parse(readFileSync(r("references/network-config.json"), "utf8")).testnet;
const AGENTS = JSON.parse(readFileSync(r("references/agents.json"), "utf8")).agents;
const PLATFORM_ABI = JSON.parse(readFileSync(r("references/abi/AgentRequester.json"), "utf8"));
const ESCROW = JSON.parse(readFileSync(r("lib/somnia/escrow-deployment.json"), "utf8"));

const chain = defineChain({
  id: NET.chainId,
  name: NET.network,
  nativeCurrency: NET.nativeCurrency,
  rpcUrls: { default: { http: [NET.rpcUrl] } }
});

const raw = process.env.PRIVATE_KEY;
const stripped = raw.startsWith("0x") ? raw.slice(2) : raw;
const account = privateKeyToAccount(`0x${stripped}`);
const publicClient = createPublicClient({ chain, transport: http(NET.rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(NET.rpcUrl) });

const PLATFORM = NET.contracts.SomniaAgents;
const SUB = 3;
const FIN = parseAbiItem("event RequestFinalized(uint256 indexed requestId, uint8 status)");
const STATUS = ["None", "Pending", "Success", "Failed", "TimedOut"];

const TARGET = process.argv[2] || "0x841b8199E6d3Db3C6f264f6C2bd8848b3cA64223";
const INTENT = process.argv[3] || "audit";

async function dispatchAgent(slug, fn, args) {
  const manifest = AGENTS[slug];
  const payload = encodeFunctionData({ abi: manifest.abi, functionName: fn, args });
  const agentId = BigInt(manifest.agentId);
  const reserve = await publicClient.readContract({
    address: PLATFORM,
    abi: PLATFORM_ABI,
    functionName: "getRequestDeposit"
  });
  const reward = parseEther(manifest.pricePerAgent) * BigInt(SUB);
  const agentDeposit = reserve + reward;

  console.log(`  > escrow.dispatchFor(${slug}, ${fn})  deposit=${formatEther(agentDeposit)} STT`);
  const gasEst = await publicClient.estimateContractGas({
    address: ESCROW.address,
    abi: ESCROW.abi,
    functionName: "dispatchFor",
    args: [account.address, agentId, payload, agentDeposit],
    account: account.address
  });
  const txHash = await walletClient.writeContract({
    address: ESCROW.address,
    abi: ESCROW.abi,
    functionName: "dispatchFor",
    args: [account.address, agentId, payload, agentDeposit],
    gas: (gasEst * 130n) / 100n
  });
  console.log(`    tx: ${txHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  let requestId;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== PLATFORM.toLowerCase()) continue;
    try {
      const d = decodeEventLog({ abi: PLATFORM_ABI, data: log.data, topics: log.topics });
      if (d.eventName === "RequestCreated") {
        requestId = d.args.requestId;
        break;
      }
    } catch {}
  }
  if (!requestId) throw new Error("no RequestCreated");
  console.log(`    requestId ${requestId}  receipt → ${NET.agentExplorerUrl}/receipts/${requestId}`);

  // wait finalization
  let cursor = receipt.blockNumber;
  const deadline = Date.now() + 15 * 60_000;
  let fin;
  while (Date.now() < deadline) {
    const head = await publicClient.getBlockNumber();
    if (cursor > head) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    const to = cursor + 999n > head ? head : cursor + 999n;
    const logs = await publicClient.getLogs({
      address: PLATFORM,
      event: FIN,
      args: { requestId },
      fromBlock: cursor,
      toBlock: to
    });
    if (logs.length > 0) {
      const l = logs[0];
      fin = { status: STATUS[Number(l.args.status)], block: l.blockNumber };
      break;
    }
    cursor = to + 1n;
    if (cursor > head) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!fin) throw new Error("finalization timeout");
  console.log(`    finalized: ${fin.status} @block ${fin.block}`);
  if (fin.status !== "Success") return { ok: false, requestId, status: fin.status };

  // decode with retry
  let result;
  for (let attempt = 0; attempt < 3 && !result; attempt++) {
    for (const blockNumber of [fin.block - 1n, fin.block - 2n]) {
      try {
        const req = await publicClient.readContract({
          address: PLATFORM,
          abi: PLATFORM_ABI,
          functionName: "getRequest",
          args: [requestId],
          blockNumber
        });
        const ok = req.responses.find((r) => r.status === 2 && r.result && r.result !== "0x");
        if (ok) {
          const decoded = decodeFunctionResult({ abi: manifest.abi, functionName: fn, data: ok.result });
          result = typeof decoded === "string" ? decoded : JSON.stringify(decoded);
          break;
        }
      } catch {}
    }
    if (!result) await new Promise((r) => setTimeout(r, 1500));
  }
  return { ok: true, requestId, output: result || "" };
}

// ---- ensure enough credit ----
const want = parseEther("3");
const credit = await publicClient.readContract({
  address: ESCROW.address,
  abi: ESCROW.abi,
  functionName: "credits",
  args: [account.address]
});
console.log(`credit: ${formatEther(credit)} STT`);
if (credit < want) {
  console.log(`  topping up ${formatEther(want - credit)} STT`);
  const gas = await publicClient.estimateContractGas({
    address: ESCROW.address,
    abi: ESCROW.abi,
    functionName: "deposit",
    value: want - credit,
    account: account.address
  });
  const h = await walletClient.writeContract({
    address: ESCROW.address,
    abi: ESCROW.abi,
    functionName: "deposit",
    value: want - credit,
    gas: (gas * 130n) / 100n
  });
  await publicClient.waitForTransactionReceipt({ hash: h });
  console.log(`  ✓ deposit confirmed`);
}

// ---- scout ----
console.log(`\n[1/3] scout-fetch ─ pulling source for ${TARGET}`);
const sourceUrl = `${NET.explorerUrl.replace(/\/$/, "")}/api?module=contract&action=getsourcecode&address=${TARGET}`;
const scout = await dispatchAgent("json-fetch", "fetchString", [sourceUrl, "result.0.SourceCode"]);
if (!scout.ok) process.exit(1);
console.log(`    output: ${(scout.output || "").slice(0, 100)}…`);

// ---- decoder ----
console.log(`\n[2/3] contract-decoder ─ auditing source`);
const auditSys =
  "You are a Solidity security auditor. Read the contract source. Return ONLY a strict JSON object: " +
  '{"verdict":"<one sentence>","severity":"high|med|low","risk_score":<0-100>,"findings":[{"sev":"high|med|low","title":"...","desc":"...","fn":"..."}]}. ' +
  "No markdown, no commentary.";
const decoder = await dispatchAgent("llm-inference", "inferString", [
  `Audit this Solidity contract:\n${(scout.output || "").slice(0, 3000)}`,
  auditSys,
  true,
  []
]);
if (!decoder.ok) process.exit(1);
console.log(`    output: ${(decoder.output || "").slice(0, 300)}`);

// ---- synth ----
console.log(`\n[3/3] synthesizer ─ composing dossier`);
const synthSys =
  "You are the {s}hinyAudit synthesizer. Compose a concise FORENSIC DOSSIER IN MARKDOWN from the audit JSON. " +
  "Start with a single bold verdict line. Then sections: ## Summary / ## Findings / ## Citations. Be terse and technical.";
const synth = await dispatchAgent("llm-inference", "inferString", [
  `Findings JSON:\n${decoder.output}\n\nTarget: ${TARGET}\nIntent: ${INTENT}`,
  synthSys,
  true,
  []
]);
console.log(`\n═══════════ DOSSIER ═══════════`);
console.log(synth.output || "(empty)");
console.log(`═══════════════════════════════`);

console.log(`\n✓ pipeline complete`);
console.log(`citations:`);
console.log(`  - scout    receipt → ${NET.agentExplorerUrl}/receipts/${scout.requestId}`);
console.log(`  - decoder  receipt → ${NET.agentExplorerUrl}/receipts/${decoder.requestId}`);
if (synth.requestId) console.log(`  - synth    receipt → ${NET.agentExplorerUrl}/receipts/${synth.requestId}`);
