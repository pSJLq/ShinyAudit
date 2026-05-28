/**
 * Compile + deploy ShinyAuditEscrow.sol to Somnia testnet.
 *
 *   node scripts/compile-and-deploy-escrow.mjs
 *
 * Reads PRIVATE_KEY + DEPLOYER_ADDRESS from .env. Writes:
 *   - artifacts/ShinyAuditEscrow.json (ABI + bytecode)
 *   - lib/somnia/escrow-address.ts    (deployed address + ABI re-export)
 *   - prepends NEXT_PUBLIC_ESCROW_ADDRESS to .env.local
 */

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const REPO = process.cwd();
const SRC_PATH = resolve(REPO, "contracts/ShinyAuditEscrow.sol");
const ARTIFACT_DIR = resolve(REPO, "artifacts");
const ARTIFACT_PATH = resolve(ARTIFACT_DIR, "ShinyAuditEscrow.json");
const ADDRESS_OUT = resolve(REPO, "lib/somnia/escrow-deployment.json");

const NET = JSON.parse(readFileSync(resolve(REPO, "references/network-config.json"), "utf8")).testnet;
const PLATFORM = NET.contracts.SomniaAgents;

// ---------- compile ----------

console.log(`> compiling ${SRC_PATH}`);
const source = readFileSync(SRC_PATH, "utf8");
const input = {
  language: "Solidity",
  sources: { "ShinyAuditEscrow.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
    evmVersion: "paris"
  }
};

const out = JSON.parse(solc.compile(JSON.stringify(input)));
if (out.errors) {
  let hasFatal = false;
  for (const e of out.errors) {
    console.log(e.formattedMessage);
    if (e.severity === "error") hasFatal = true;
  }
  if (hasFatal) {
    console.error("Compilation failed.");
    process.exit(1);
  }
}
const artifact = out.contracts["ShinyAuditEscrow.sol"]["ShinyAuditEscrow"];
if (!artifact) {
  console.error("Compiled artifact for ShinyAuditEscrow not found");
  process.exit(1);
}

mkdirSync(ARTIFACT_DIR, { recursive: true });
writeFileSync(ARTIFACT_PATH, JSON.stringify({ abi: artifact.abi, bytecode: "0x" + artifact.evm.bytecode.object }, null, 2));
console.log(`  artifact:  ${ARTIFACT_PATH}`);
console.log(`  bytecode:  ${artifact.evm.bytecode.object.length / 2} bytes`);

// ---------- deploy ----------

const raw = process.env.PRIVATE_KEY;
if (!raw) throw new Error("PRIVATE_KEY missing");
const stripped = raw.startsWith("0x") ? raw.slice(2) : raw;
const account = privateKeyToAccount(`0x${stripped}`);
const orchestrator = account.address; // EOA itself acts as orchestrator

const chain = defineChain({
  id: NET.chainId,
  name: NET.network,
  nativeCurrency: NET.nativeCurrency,
  rpcUrls: { default: { http: [NET.rpcUrl] } }
});
const publicClient = createPublicClient({ chain, transport: http(NET.rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(NET.rpcUrl) });

const balance = await publicClient.getBalance({ address: account.address });
console.log(`\n> deployer: ${account.address}`);
console.log(`  balance:  ${formatEther(balance)} ${NET.nativeCurrency.symbol}`);
console.log(`  platform: ${PLATFORM}`);
console.log(`  orchestrator: ${orchestrator}\n`);

console.log("> deploying ShinyAuditEscrow…");
// Pre-estimate gas — Somnia rejects deploys with hard-coded gas == max if the
// EVM actually runs the constructor short. Using estimator gives ~constructor + buffer.
const { encodeDeployData } = await import("viem");
const deployData = encodeDeployData({
  abi: artifact.abi,
  bytecode: "0x" + artifact.evm.bytecode.object,
  args: [PLATFORM, orchestrator]
});
const gasEst = await publicClient.estimateGas({
  account: account.address,
  data: deployData,
  to: undefined
});
console.log(`  estimated gas: ${gasEst}`);

const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: ("0x" + artifact.evm.bytecode.object),
  args: [PLATFORM, orchestrator],
  gas: gasEst + 100_000n
});
console.log(`  tx:       ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") {
  console.error(`Deployment REVERTED — status: ${receipt.status}, gasUsed: ${receipt.gasUsed}`);
  process.exit(1);
}
if (!receipt.contractAddress) {
  console.error("Deployment failed — no contractAddress in receipt");
  process.exit(1);
}
// Verify bytecode actually landed
const code = await publicClient.getBytecode({ address: receipt.contractAddress });
if (!code || code === "0x") {
  console.error(`Deployment failed — no bytecode at ${receipt.contractAddress}`);
  process.exit(1);
}
console.log(`  bytecode on-chain: ${code.length} chars ✓`);
const deployedAddress = receipt.contractAddress;
console.log(`  address:  ${deployedAddress}`);
console.log(`  explorer: ${NET.explorerUrl}/address/${deployedAddress}`);

writeFileSync(ADDRESS_OUT, JSON.stringify({
  address: deployedAddress,
  txHash: hash,
  network: "testnet",
  chainId: NET.chainId,
  platform: PLATFORM,
  orchestrator,
  owner: account.address,
  abi: artifact.abi
}, null, 2));
console.log(`\n  saved → ${ADDRESS_OUT}`);

// Append to .env.local if missing
const envLocal = resolve(REPO, ".env.local");
const envLine = `NEXT_PUBLIC_ESCROW_ADDRESS=${deployedAddress}\n`;
const existing = existsSync(envLocal) ? readFileSync(envLocal, "utf8") : "";
if (!existing.includes("NEXT_PUBLIC_ESCROW_ADDRESS=")) {
  appendFileSync(envLocal, envLine);
  console.log(`  appended NEXT_PUBLIC_ESCROW_ADDRESS to .env.local`);
} else {
  console.log(`  .env.local already has NEXT_PUBLIC_ESCROW_ADDRESS — please update manually if changed`);
}

console.log("\n✓ done");
