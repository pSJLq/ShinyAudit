/**
 * End-to-end live test of the Somnia Agent platform.
 *
 *   node scripts/live-invoke.mjs
 *
 * Steps:
 *   1. Encode `json-fetch.fetchString(url, selector)`
 *   2. createRequest with deposit = getRequestDeposit() + 0.03 * 3
 *   3. Wait for RequestFinalized event
 *   4. Read getRequest at finalizedBlock - 1, decode response
 *
 * Cost: ~0.2 STT.
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
  parseEther,
  zeroAddress
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const REPO_ROOT = process.cwd();
const REF = (p) => resolve(REPO_ROOT, "references", p);

const networks = JSON.parse(readFileSync(REF("network-config.json"), "utf8"));
const agents = JSON.parse(readFileSync(REF("agents.json"), "utf8")).agents;
const platformAbi = JSON.parse(readFileSync(REF("abi/AgentRequester.json"), "utf8"));

const NET = networks.testnet;
const AGENT = agents["json-fetch"];

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
const platform = NET.contracts.SomniaAgents;

// Build a tiny json-fetch call against a public API.
// Try Shannon explorer's own /api?module=stats&action=ethsupply — guaranteed
// to be reachable from validators on Somnia infra.
const URL_TO_FETCH = "https://shannon-explorer.somnia.network/api?module=stats&action=ethsupply";
const SELECTOR = "status"; // dot-notation per docs (no $. prefix)
const FN = "fetchString";

console.log(`> live invoke: ${AGENT.name} (${AGENT.agentId})`);
console.log(`  fn:       ${FN}`);
console.log(`  url:      ${URL_TO_FETCH}`);
console.log(`  selector: ${SELECTOR}`);
console.log();

const payload = encodeFunctionData({
  abi: AGENT.abi,
  functionName: FN,
  args: [URL_TO_FETCH, SELECTOR]
});

const SUB_SIZE = 3;
const reserve = await publicClient.readContract({
  address: platform,
  abi: platformAbi,
  functionName: "getRequestDeposit"
});
const reward = parseEther(AGENT.pricePerAgent) * BigInt(SUB_SIZE);
const deposit = reserve + reward;

console.log(`  reserve:  ${formatEther(reserve)} STT`);
console.log(`  reward:   ${formatEther(reward)} STT  (${AGENT.pricePerAgent} * ${SUB_SIZE})`);
console.log(`  deposit:  ${formatEther(deposit)} STT`);
console.log();

const balance = await publicClient.getBalance({ address: account.address });
console.log(`  balance:  ${formatEther(balance)} STT`);
if (balance < deposit + parseEther("0.01")) {
  console.error("not enough balance for deposit + gas");
  process.exit(1);
}

console.log(`> submitting createRequest…`);
const txHash = await walletClient.writeContract({
  address: platform,
  abi: platformAbi,
  functionName: "createRequest",
  args: [BigInt(AGENT.agentId), zeroAddress, "0x00000000", payload],
  value: deposit,
  gas: 2_000_000n
});
console.log(`  tx:       ${txHash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
let requestId;
for (const log of receipt.logs) {
  if (log.address.toLowerCase() !== platform.toLowerCase()) continue;
  try {
    const decoded = decodeEventLog({ abi: platformAbi, data: log.data, topics: log.topics });
    if (decoded.eventName === "RequestCreated") {
      requestId = decoded.args.requestId;
      break;
    }
  } catch {}
}
if (!requestId) throw new Error("RequestCreated event missing");
console.log(`  requestId: ${requestId}`);
console.log(`  receipt:   ${NET.agentExplorerUrl}/receipts/${requestId}`);
console.log();

// Watch RequestFinalized
const FINALIZED = parseAbiItem("event RequestFinalized(uint256 indexed requestId, uint8 status)");
const RS = ["None", "Pending", "Success", "Failed", "TimedOut"];
const DEADLINE = Date.now() + 15 * 60_000;
let cursor = receipt.blockNumber;
console.log(`> waiting for finalization from block ${cursor}…`);

while (Date.now() < DEADLINE) {
  const head = await publicClient.getBlockNumber();
  if (cursor > head) {
    await new Promise((r) => setTimeout(r, 2000));
    continue;
  }
  const to = cursor + 999n > head ? head : cursor + 999n;
  const logs = await publicClient.getLogs({
    address: platform,
    event: FINALIZED,
    args: { requestId },
    fromBlock: cursor,
    toBlock: to
  });
  if (logs.length > 0) {
    const log = logs[0];
    const status = RS[Number(log.args.status)] ?? "None";
    console.log(`  finalized: status=${status} at block ${log.blockNumber}`);
    if (status === "Success") {
      const req = await publicClient.readContract({
        address: platform,
        abi: platformAbi,
        functionName: "getRequest",
        args: [requestId],
        blockNumber: log.blockNumber - 1n
      });
      const ok = req.responses.find((r) => r.status === 2);
      if (ok && ok.result && ok.result !== "0x") {
        const decoded = decodeFunctionResult({
          abi: AGENT.abi,
          functionName: FN,
          data: ok.result
        });
        console.log(`  RESULT:    ${decoded}`);
      }
    }
    process.exit(0);
  }
  cursor = to + 1n;
  if (cursor > head) await new Promise((r) => setTimeout(r, 2000));
}
console.error("timed out");
process.exit(1);
