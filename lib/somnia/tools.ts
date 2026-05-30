/**
 * Tool catalogue for the agent loop — v2 (production-grade).
 *
 * Three classes of tools, all on-chain via Somnia agents:
 *
 *  • json-fetch       — Shannon Explorer Blockscout REST endpoints
 *  • llm-parse-website — real-browser scraping (OpenSea, GitHub, etc)
 *  • composite        — multi-step combos
 *
 * Each tool returns a single ABI-encoded scalar so validator consensus is
 * trivial. Tools that return numbers use fetchUint (deterministic byte
 * output) instead of fetchString (formatting drift).
 *
 * References:
 *   - Blockscout REST API: https://docs.blockscout.com/devs/apis/rest
 *   - Somnia agents: https://docs.somnia.network/agents
 *   - emrestay/somnia-agents-skills (master knowledge skill)
 */

import { EXPLORER_API } from "./chains";

// Base URL for our own /api/identity aggregator. In prod set BASE_URL to the
// deployed origin (e.g. https://shinyaudit.xyz). On Somnia testnet validators
// must be able to HTTPS-reach this — for local dev expose via cloudflared
// tunnel and set BASE_URL to that tunnel host.
const BASE_URL = (process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const IDENTITY_AGG = (address: string) => `${BASE_URL}/api/identity/${address}`;
const SNAPSHOT_AGG = (address: string) => `${BASE_URL}/api/snapshot/${address}`;
const SNAPSHOT_TX  = (hash: string)    => `${BASE_URL}/api/snapshot/tx/${hash}`;
const SNAPSHOT_TOKEN = (address: string) => `${BASE_URL}/api/snapshot/token/${address}`;
const SOURCE_AGG = (address: string) => `${BASE_URL}/api/source/${address}`;
const OWNER_AGG = (address: string) => `${BASE_URL}/api/owner/${address}`;
const CALL_AGG = (to: string, sig: string, args: string) =>
  `${BASE_URL}/api/call?to=${to}&sig=${encodeURIComponent(sig)}${args ? `&args=${encodeURIComponent(args)}` : ""}`;
const DISCOVER_AGG = (kind: string, q: string, days: string) =>
  `${BASE_URL}/api/discover?kind=${encodeURIComponent(kind)}${q ? `&q=${encodeURIComponent(q)}` : ""}${days ? `&days=${encodeURIComponent(days)}` : ""}`;
const ACTIVE_AGG = (pages: string) => `${BASE_URL}/api/active${pages ? `?pages=${encodeURIComponent(pages)}` : ""}`;
// Universal data primitives — the agent constructs the request itself.
const EXPLORER_PATH = (path: string) => {
  const clean = String(path).replace(/^\/+/, "");          // strip leading slash
  // allow either "addresses/0x.." (we prepend v2) or a full "api/v2/..." path
  return clean.startsWith("api/") ? `${EXPLORER_API.replace(/\/api$/, "")}/${clean}` : `${EXPLORER_V2_BASE}/${clean}`;
};
const WEB_URL = (url: string) => {
  let u = String(url).trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;        // default to https
  return u;
};
// ── 10 capability endpoints ──
const CLASSIFY_AGG = (a: string) => `${BASE_URL}/api/classify/${a}`;
const APPROVALS_AGG = (a: string) => `${BASE_URL}/api/approvals/${a}`;
const FLOW_AGG = (a: string) => `${BASE_URL}/api/flow/${a}`;
const SAFETY_AGG = (a: string) => `${BASE_URL}/api/safety/${a}`;
const CLONES_AGG = (a: string) => `${BASE_URL}/api/clones/${a}`;
const COMPARE_AGG = (a: string, b: string) => `${BASE_URL}/api/compare?a=${a}&b=${b}`;
const EVENTS_AGG = (a: string) => `${BASE_URL}/api/events/${a}`;
const RESOLVE_AGG = (q: string) => `${BASE_URL}/api/resolve?q=${encodeURIComponent(q)}`;
const NFT_AGG = (a: string) => `${BASE_URL}/api/nft/${a}`;
const TIMELINE_AGG = (a: string) => `${BASE_URL}/api/timeline/${a}`;
// ── 10 hacker-grade endpoints ──
const SELECTORS_AGG = (a: string) => `${BASE_URL}/api/selectors/${a}`;
const BYTESCAN_AGG = (a: string) => `${BASE_URL}/api/bytecode-scan/${a}`;
const HONEYPOT_AGG = (a: string) => `${BASE_URL}/api/honeypot/${a}`;
const STORAGE_AGG = (a: string, slot: string) => `${BASE_URL}/api/storage/${a}?slot=${encodeURIComponent(slot || "0")}`;
const DISTRIBUTION_AGG = (a: string) => `${BASE_URL}/api/distribution/${a}`;
const WEALTH_AGG = (a: string) => `${BASE_URL}/api/wealth/${a}`;
const ARCHETYPE_AGG = (a: string) => `${BASE_URL}/api/archetype/${a}`;
const UPGRADES_AGG = (a: string) => `${BASE_URL}/api/upgrades/${a}`;

// First-tx feeds (asc) for the funding-trail playbook — same Blockscout v1
// shape but sorted oldest-first instead of newest-first.
const TXLIST_FIRST = (address: string, offset = 5) =>
  `${EXPLORER_API}?module=account&action=txlist&address=${address}&page=1&offset=${offset}&sort=asc`;
const INTERNAL_FIRST = (address: string, offset = 5) =>
  `${EXPLORER_API}?module=account&action=txlistinternal&address=${address}&page=1&offset=${offset}&sort=asc`;

export type ToolFn = "fetchString" | "fetchUint" | "fetchBool" | "ExtractString" | "ExtractANumber";

export interface ToolSpec {
  /** stable id used by the planner */
  name: string;
  /** which Somnia base agent — 100% on-chain, every call leaves a receipt */
  agent: "json-fetch" | "llm-parse-website";
  /** which agent function to call */
  fn: ToolFn;
  /** human-readable description for the planner LLM */
  description: string;
  /** which Blockscout module — used to group in UI */
  category: "account" | "token" | "contract" | "tx" | "stats" | "block" | "logs" | "web" | "identity";
  /** JSON-schema-lite for args (used in the planner prompt) */
  args: Record<string, string>;
  /** build the payload args for this tool call */
  build: (args: Record<string, string | number>) => BuiltTool;
}

export type BuiltTool =
  | { kind: "fetchString"; url: string; selector: string }
  | { kind: "fetchUint";   url: string; selector: string; decimals: number }
  | { kind: "fetchBool";   url: string; selector: string }
  | { kind: "ExtractString"; key: string; description: string; options: string[]; prompt: string; url: string; resolveUrl: boolean; numPages: number }
  | { kind: "ExtractANumber"; key: string; description: string; min: bigint; max: bigint; prompt: string; url: string; resolveUrl: boolean; numPages: number }
  /** Composite: a single planner "slot" that fans out to N sub-tools in
   *  sequence (one EOA can't parallel-sign due to nonce ordering). Result
   *  is a labelled joined string: "label1=val1 | label2=val2 | …".
   *  Caller dispatches each sub-tool independently against Somnia.       */
  | { kind: "composite"; steps: Array<{ label: string; sub: BuiltTool }> };

const TXLIST = (address: string, offset = 10) =>
  `${EXPLORER_API}?module=account&action=txlist&address=${address}&page=1&offset=${offset}&sort=desc`;
const INTERNAL = (address: string, offset = 10) =>
  `${EXPLORER_API}?module=account&action=txlistinternal&address=${address}&page=1&offset=${offset}&sort=desc`;
const TOKENTX = (address: string, offset = 10) =>
  `${EXPLORER_API}?module=account&action=tokentx&address=${address}&page=1&offset=${offset}&sort=desc`;
const GETSOURCE = (address: string) =>
  `${EXPLORER_API}?module=contract&action=getsourcecode&address=${address}`;
const GETTOKEN = (address: string) =>
  `${EXPLORER_API}?module=token&action=getToken&contractaddress=${address}`;
const BALANCE = (address: string) =>
  `${EXPLORER_API}?module=account&action=balance&address=${address}`;
const TXINFO = (hash: string) =>
  `${EXPLORER_API}?module=transaction&action=gettxinfo&txhash=${hash}`;
const TXSTATUS = (hash: string) =>
  `${EXPLORER_API}?module=transaction&action=gettxreceiptstatus&txhash=${hash}`;
const TOKENBALANCE = (contract: string, address: string) =>
  `${EXPLORER_API}?module=account&action=tokenbalance&contractaddress=${contract}&address=${address}`;
const TOKENHOLDERS = (contract: string) =>
  `${EXPLORER_API}?module=token&action=getTokenHolders&contractaddress=${contract}`;

// ── Blockscout v2 API — richer JSON, GET-friendly, perfect for json-fetch ──
const EXPLORER_V2_BASE = EXPLORER_API.replace(/\/api$/, "/api/v2");
const V2_ADDRESS = (address: string) => `${EXPLORER_V2_BASE}/addresses/${address}`;
const V2_ADDRESS_COUNTERS = (address: string) => `${EXPLORER_V2_BASE}/addresses/${address}/counters`;
const V2_SMART_CONTRACT = (address: string) => `${EXPLORER_V2_BASE}/smart-contracts/${address}`;
const V2_TOKEN = (address: string) => `${EXPLORER_V2_BASE}/tokens/${address}`;
const V2_NFT_INSTANCE = (contract: string, id: string | number) =>
  `${EXPLORER_V2_BASE}/tokens/${contract}/instances/${id}`;
const V2_ADDRESS_LOGS = (address: string) => `${EXPLORER_V2_BASE}/addresses/${address}/logs`;
const V2_ADDRESS_INTERNAL = (address: string) =>
  `${EXPLORER_V2_BASE}/addresses/${address}/internal-transactions`;
const V2_ADDRESS_TX = (address: string) => `${EXPLORER_V2_BASE}/addresses/${address}/transactions`;
const V2_ADDRESS_TOKEN_TRANSFERS = (address: string) =>
  `${EXPLORER_V2_BASE}/addresses/${address}/token-transfers`;
const V2_ADDRESS_TOKENS = (address: string) => `${EXPLORER_V2_BASE}/addresses/${address}/tokens`;
const V2_TX = (hash: string) => `${EXPLORER_V2_BASE}/transactions/${hash}`;
const V2_TX_INTERNAL = (hash: string) => `${EXPLORER_V2_BASE}/transactions/${hash}/internal-transactions`;
const V2_TX_LOGS = (hash: string) => `${EXPLORER_V2_BASE}/transactions/${hash}/logs`;
const V2_TX_TOKEN_TRANSFERS = (hash: string) =>
  `${EXPLORER_V2_BASE}/transactions/${hash}/token-transfers`;
const V2_STATS = `${EXPLORER_V2_BASE}/stats`;
const V2_MAIN_TXS = `${EXPLORER_V2_BASE}/main-page/transactions`;
const V2_TOKEN_HOLDERS_FULL = (address: string) =>
  `${EXPLORER_V2_BASE}/tokens/${address}/holders`;
const V2_TOKEN_TRANSFERS_FULL = (address: string) =>
  `${EXPLORER_V2_BASE}/tokens/${address}/transfers`;
const V2_BALANCE_HISTORY = (address: string) =>
  `${EXPLORER_V2_BASE}/addresses/${address}/coin-balance-history`;
const V2_BALANCE_DAILY = (address: string) =>
  `${EXPLORER_V2_BASE}/addresses/${address}/coin-balance-history-by-day`;
const V2_ADDRESS_WITHDRAWALS = (address: string) =>
  `${EXPLORER_V2_BASE}/addresses/${address}/withdrawals`;
const V2_ADDRESS_BLOCKS_VALIDATED = (address: string) =>
  `${EXPLORER_V2_BASE}/addresses/${address}/blocks-validated`;
const V2_BLOCKS = `${EXPLORER_V2_BASE}/blocks?type=block`;
const V2_BLOCK = (height: string | number) => `${EXPLORER_V2_BASE}/blocks/${height}`;
const V2_BLOCK_TXS = (height: string | number) =>
  `${EXPLORER_V2_BASE}/blocks/${height}/transactions`;
const V2_BLOCK_WITHDRAWALS = (height: string | number) =>
  `${EXPLORER_V2_BASE}/blocks/${height}/withdrawals`;
const V2_SEARCH = (q: string) => `${EXPLORER_V2_BASE}/search?q=${encodeURIComponent(q)}`;
const V2_SEARCH_REDIRECT = (q: string) =>
  `${EXPLORER_V2_BASE}/search/check-redirect?q=${encodeURIComponent(q)}`;
const V2_TOKENS_LIST = `${EXPLORER_V2_BASE}/tokens`;
const V2_VERIFIED_CONTRACTS = `${EXPLORER_V2_BASE}/smart-contracts?filter=verified`;

// ── 4byte directory — open database of every known Solidity function selector ──
// `ordering=created_at` ASC → the OLDEST (canonical) signature first.
// Newest-first ordering is full of spam-collision attacks ("workMyDirefulOwner"
// for 0xa9059cbb), so we always sort by creation date and pick index 0.
const FOURBYTE = (sel: string) =>
  `https://www.4byte.directory/api/v1/signatures/?ordering=created_at&hex_signature=${sel.startsWith("0x") ? sel : "0x" + sel}`;

export const TOOLS: ToolSpec[] = [
  // ── account / wallet ────────────────────────────────────────
  {
    name: "wallet_balance",
    agent: "json-fetch", fn: "fetchUint", category: "account",
    description: "STT balance of a wallet (wei).",
    args: { address: "0x... wallet" },
    build: ({ address }) => ({ kind: "fetchUint", url: BALANCE(String(address)), selector: "result", decimals: 0 })
  },
  {
    name: "wallet_tx_count_recent",
    agent: "json-fetch", fn: "fetchUint", category: "account",
    description: "Count of recent transactions visible (max 10 — cap on what we fetch, not total wallet history).",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchUint", url: TXLIST(String(address), 10), selector: "result.length", decimals: 0 })
  },

  // ── tx fields (indexed access to recent 10 txs) ────────────
  {
    name: "tx_hash",
    agent: "json-fetch", fn: "fetchString", category: "tx",
    description: "Hash of the N-th most recent tx from a wallet (0..9).",
    args: { address: "0x...", index: "0..9" },
    build: ({ address, index }) => ({ kind: "fetchString", url: TXLIST(String(address)), selector: `result.${index}.hash` })
  },
  {
    name: "tx_counterparty",
    agent: "json-fetch", fn: "fetchString", category: "tx",
    description: "The `to` address (counterparty) of the N-th most recent tx.",
    args: { address: "0x...", index: "0..9" },
    build: ({ address, index }) => ({ kind: "fetchString", url: TXLIST(String(address)), selector: `result.${index}.to` })
  },
  {
    name: "tx_value",
    agent: "json-fetch", fn: "fetchUint", category: "tx",
    description: "Native-token value (wei) of the N-th most recent tx.",
    args: { address: "0x...", index: "0..9" },
    build: ({ address, index }) => ({ kind: "fetchUint", url: TXLIST(String(address)), selector: `result.${index}.value`, decimals: 0 })
  },
  {
    name: "tx_method_id",
    agent: "json-fetch", fn: "fetchString", category: "tx",
    description: "4-byte function selector of the N-th tx ('0xa9059cbb'=transfer). '0x' = plain transfer.",
    args: { address: "0x...", index: "0..9" },
    build: ({ address, index }) => ({ kind: "fetchString", url: TXLIST(String(address)), selector: `result.${index}.methodId` })
  },
  {
    name: "tx_timestamp",
    agent: "json-fetch", fn: "fetchUint", category: "tx",
    description: "Unix timestamp (seconds) of the N-th tx.",
    args: { address: "0x...", index: "0..9" },
    build: ({ address, index }) => ({ kind: "fetchUint", url: TXLIST(String(address)), selector: `result.${index}.timeStamp`, decimals: 0 })
  },
  {
    name: "tx_block_number",
    agent: "json-fetch", fn: "fetchUint", category: "tx",
    description: "Block number of the N-th tx (newest first).",
    args: { address: "0x...", index: "0..9" },
    build: ({ address, index }) => ({ kind: "fetchUint", url: TXLIST(String(address)), selector: `result.${index}.blockNumber`, decimals: 0 })
  },
  {
    name: "tx_gas_used",
    agent: "json-fetch", fn: "fetchUint", category: "tx",
    description: "Gas used by the N-th tx (signal for tx complexity).",
    args: { address: "0x...", index: "0..9" },
    build: ({ address, index }) => ({ kind: "fetchUint", url: TXLIST(String(address)), selector: `result.${index}.gasUsed`, decimals: 0 })
  },
  {
    name: "tx_is_error",
    agent: "json-fetch", fn: "fetchString", category: "tx",
    description: "'1' if the N-th tx reverted, '0' otherwise.",
    args: { address: "0x...", index: "0..9" },
    build: ({ address, index }) => ({ kind: "fetchString", url: TXLIST(String(address)), selector: `result.${index}.isError` })
  },

  // ── lookup specific tx by hash ─────────────────────────────
  {
    name: "txinfo_to",
    agent: "json-fetch", fn: "fetchString", category: "tx",
    description: "Get `to` address of a specific tx by hash.",
    args: { txhash: "0x... 64-char" },
    build: ({ txhash }) => ({ kind: "fetchString", url: TXINFO(String(txhash)), selector: "result.to" })
  },
  {
    name: "txinfo_value",
    agent: "json-fetch", fn: "fetchUint", category: "tx",
    description: "Native value of a specific tx by hash.",
    args: { txhash: "0x..." },
    build: ({ txhash }) => ({ kind: "fetchUint", url: TXINFO(String(txhash)), selector: "result.value", decimals: 0 })
  },
  {
    name: "txinfo_success",
    agent: "json-fetch", fn: "fetchString", category: "tx",
    description: "'1' if tx succeeded, '0' if reverted (by hash).",
    args: { txhash: "0x..." },
    build: ({ txhash }) => ({ kind: "fetchString", url: TXSTATUS(String(txhash)), selector: "result.status" })
  },

  // ── internal txs / deployments ─────────────────────────────
  {
    name: "internal_deploy_addr",
    agent: "json-fetch", fn: "fetchString", category: "tx",
    description: "Address of the N-th internal tx that deployed a contract by this wallet. Empty if none.",
    args: { address: "0x...", index: "0..9" },
    build: ({ address, index }) => ({ kind: "fetchString", url: INTERNAL(String(address)), selector: `result.${index}.contractAddress` })
  },

  // ── ERC-20 / ERC-721 transfers ─────────────────────────────
  {
    name: "tokentx_token_addr",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Token contract address of the N-th recent token transfer for a wallet.",
    args: { address: "0x...", index: "0..9" },
    build: ({ address, index }) => ({ kind: "fetchString", url: TOKENTX(String(address)), selector: `result.${index}.contractAddress` })
  },
  {
    name: "tokentx_token_symbol",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Symbol of the token in the N-th token transfer (e.g. 'USDC').",
    args: { address: "0x...", index: "0..9" },
    build: ({ address, index }) => ({ kind: "fetchString", url: TOKENTX(String(address)), selector: `result.${index}.tokenSymbol` })
  },
  {
    name: "tokentx_amount",
    agent: "json-fetch", fn: "fetchUint", category: "token",
    description: "Token amount (raw units) of the N-th token transfer.",
    args: { address: "0x...", index: "0..9" },
    build: ({ address, index }) => ({ kind: "fetchUint", url: TOKENTX(String(address)), selector: `result.${index}.value`, decimals: 0 })
  },
  {
    name: "tokentx_to",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Recipient of the N-th token transfer.",
    args: { address: "0x...", index: "0..9" },
    build: ({ address, index }) => ({ kind: "fetchString", url: TOKENTX(String(address)), selector: `result.${index}.to` })
  },

  // ── contract metadata ─────────────────────────────────────
  {
    name: "contract_name",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "Verified contract name (e.g. 'Multicall3'). Empty if not verified.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: GETSOURCE(String(address)), selector: "result.0.ContractName" })
  },
  {
    name: "contract_compiler",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "Compiler version of a verified contract. Empty if not verified.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: GETSOURCE(String(address)), selector: "result.0.CompilerVersion" })
  },
  {
    name: "contract_is_proxy",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "'true' if the verified contract is a proxy. Empty if not verified.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: GETSOURCE(String(address)), selector: "result.0.IsProxy" })
  },
  {
    name: "contract_source",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "Verified Solidity source, consensus-bounded to ~9KB (head + security-relevant lines). One on-chain dispatch. Empty if unverified.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: SOURCE_AGG(String(address)), selector: "summary" })
  },
  {
    name: "contract_abi",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "JSON ABI of a verified contract — useful for understanding callable functions. Empty if unverified.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: GETSOURCE(String(address)), selector: "result.0.ABI" })
  },

  // ── token (ERC-20/721) metadata ─────────────────────────────
  {
    name: "token_name",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Name of an ERC-20/721 token contract (e.g. 'Wrapped Ether'). Empty if not a token.",
    args: { address: "0x... token contract" },
    build: ({ address }) => ({ kind: "fetchString", url: GETTOKEN(String(address)), selector: "result.name" })
  },
  {
    name: "token_symbol",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Symbol of an ERC-20/721 token (e.g. 'WETH').",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: GETTOKEN(String(address)), selector: "result.symbol" })
  },
  {
    name: "token_supply",
    agent: "json-fetch", fn: "fetchUint", category: "token",
    description: "Total supply of a token in raw units (before decimals).",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchUint", url: GETTOKEN(String(address)), selector: "result.totalSupply", decimals: 0 })
  },
  {
    name: "token_decimals",
    agent: "json-fetch", fn: "fetchUint", category: "token",
    description: "Token decimals (usually 18 for ERC-20, 0 for ERC-721).",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchUint", url: GETTOKEN(String(address)), selector: "result.decimals", decimals: 0 })
  },
  {
    name: "token_balance",
    agent: "json-fetch", fn: "fetchUint", category: "token",
    description: "Token balance of a wallet for a specific token contract.",
    args: { token: "0x... token contract", address: "0x... wallet" },
    build: ({ token, address }) => ({
      kind: "fetchUint",
      url: TOKENBALANCE(String(token), String(address)),
      selector: "result",
      decimals: 0
    })
  },
  {
    name: "token_holders_top_addr",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Address of the N-th top holder of a token (N=0..49).",
    args: { token: "0x... token", index: "0..49" },
    build: ({ token, index }) => ({
      kind: "fetchString",
      url: TOKENHOLDERS(String(token)),
      selector: `result.${index}.address`
    })
  },
  {
    name: "token_holders_top_value",
    agent: "json-fetch", fn: "fetchUint", category: "token",
    description: "Balance of the N-th top holder of a token.",
    args: { token: "0x... token", index: "0..49" },
    build: ({ token, index }) => ({
      kind: "fetchUint",
      url: TOKENHOLDERS(String(token)),
      selector: `result.${index}.value`,
      decimals: 0
    })
  },

  // ── Blockscout v2 — high-signal address/contract metadata via json-fetch ──
  // Every call below is a real Somnia json-fetch dispatch → audit receipt.
  // No off-chain helpers; this is the on-chain agentic path.
  {
    name: "address_is_contract",
    agent: "json-fetch", fn: "fetchBool", category: "account",
    description: "Whether the address is a smart contract (true) or an EOA (false).",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchBool", url: V2_ADDRESS(String(address)), selector: "is_contract" })
  },
  {
    name: "address_is_verified",
    agent: "json-fetch", fn: "fetchBool", category: "contract",
    description: "Whether a contract's source code is verified on Shannon Explorer.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchBool", url: V2_ADDRESS(String(address)), selector: "is_verified" })
  },
  {
    name: "address_is_scam",
    agent: "json-fetch", fn: "fetchBool", category: "account",
    description: "Blockscout's phishing/scam flag for the address. True = explorer has labelled it suspicious.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchBool", url: V2_ADDRESS(String(address)), selector: "is_scam" })
  },
  {
    name: "address_ens_domain",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "ENS domain attached to the address (e.g. 'vitalik.eth'). Empty if none.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_ADDRESS(String(address)), selector: "ens_domain_name" })
  },
  {
    name: "address_public_name",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Public name tag set by explorer (e.g. 'Binance: Hot Wallet 2'). Empty if not labelled.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_ADDRESS(String(address)), selector: "name" })
  },
  {
    name: "address_creator",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "Address of the wallet that deployed this contract. Empty if EOA / unknown.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_ADDRESS(String(address)), selector: "creator_address_hash" })
  },
  {
    name: "address_creation_tx",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "Tx hash of the contract creation. Empty if EOA.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_ADDRESS(String(address)), selector: "creation_transaction_hash" })
  },
  {
    name: "address_proxy_implementation_addr",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "For proxy contracts, the implementation contract address (0-th entry). Empty if not a proxy.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_ADDRESS(String(address)), selector: "implementations.0.address" })
  },
  {
    name: "address_proxy_implementation_name",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "Name of the implementation contract (if proxy).",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_ADDRESS(String(address)), selector: "implementations.0.name" })
  },
  {
    name: "address_has_tokens",
    agent: "json-fetch", fn: "fetchBool", category: "account",
    description: "Whether this wallet holds any tokens. Useful triage signal.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchBool", url: V2_ADDRESS(String(address)), selector: "has_tokens" })
  },
  {
    name: "address_has_token_transfers",
    agent: "json-fetch", fn: "fetchBool", category: "account",
    description: "Whether this wallet has any ERC-20/721 transfer history.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchBool", url: V2_ADDRESS(String(address)), selector: "has_token_transfers" })
  },
  {
    name: "address_total_txs",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "TOTAL transaction count for the address (entire history, as decimal string — Blockscout returns these as strings to avoid number precision loss).",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_ADDRESS_COUNTERS(String(address)), selector: "transactions_count" })
  },
  {
    name: "address_total_token_transfers",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "TOTAL ERC-20/721 transfer count (entire history, decimal string).",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_ADDRESS_COUNTERS(String(address)), selector: "token_transfers_count" })
  },
  {
    name: "address_gas_usage",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Total gas used across all of the address's transactions (decimal string).",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_ADDRESS_COUNTERS(String(address)), selector: "gas_usage_count" })
  },

  // ── on-chain bytecode via v2 ──
  {
    name: "contract_creation_bytecode",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "Hex bytecode of the contract (as deployed). Use for unverified contracts. Can be large.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_SMART_CONTRACT(String(address)), selector: "creation_bytecode" })
  },
  {
    name: "contract_deployed_bytecode",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "Runtime bytecode of the contract (post-constructor). Use to interface-classify unverified contracts.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_SMART_CONTRACT(String(address)), selector: "deployed_bytecode" })
  },
  {
    name: "contract_language",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "Source language: 'solidity', 'vyper', etc.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_SMART_CONTRACT(String(address)), selector: "language" })
  },
  {
    name: "contract_evm_version",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "EVM target version used at compilation (e.g. 'paris', 'shanghai').",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_SMART_CONTRACT(String(address)), selector: "evm_version" })
  },
  {
    name: "contract_optimization",
    agent: "json-fetch", fn: "fetchBool", category: "contract",
    description: "Whether the contract was compiled with the Solidity optimiser enabled.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchBool", url: V2_SMART_CONTRACT(String(address)), selector: "optimization_enabled" })
  },

  // ── token v2 deeper signals ──
  {
    name: "token_v2_holders_count",
    agent: "json-fetch", fn: "fetchUint", category: "token",
    description: "Total number of holders for a token (full count, not just top-N).",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchUint", url: V2_TOKEN(String(address)), selector: "holders_count", decimals: 0 })
  },
  {
    name: "token_v2_circulating",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Circulating supply of a token (raw units, as string).",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_TOKEN(String(address)), selector: "circulating_market_cap" })
  },
  {
    name: "token_v2_type",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Token standard: ERC-20, ERC-721, ERC-1155.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_TOKEN(String(address)), selector: "type" })
  },

  // ── v2 deeper address signals (proxy_type, reputation, tags) ──
  {
    name: "address_proxy_type",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "Proxy standard detected: 'eip1167', 'eip1967', 'eip1822', 'eip897', 'eip2535' (diamond), 'beacon', or empty for non-proxy.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_ADDRESS(String(address)), selector: "proxy_type" })
  },
  {
    name: "address_reputation",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Blockscout's reputation label for the address: 'ok', 'bad', 'unknown'. 'bad' = phishing/scam signal.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_ADDRESS(String(address)), selector: "reputation" })
  },
  {
    name: "address_public_tag_0",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "First public tag attached by Blockscout (e.g. 'Multisig', 'Bridge', 'Validator', 'Exchange Hot Wallet'). Empty if untagged.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_ADDRESS(String(address)), selector: "public_tags.0.display_name" })
  },
  {
    name: "address_watchlist_name",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Blockscout watchlist alias for the address (community-curated label like 'Vitalik').",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_ADDRESS(String(address)), selector: "watchlist_names.0.display_name" })
  },

  // ── address activity: logs, internal-tx, token-transfers, tokens held ──
  {
    name: "address_log_topic0",
    agent: "json-fetch", fn: "fetchString", category: "logs",
    description: "Topic[0] (event signature hash) of the N-th most recent log emitted by/at this address. Use to identify what events fire.",
    args: { address: "0x...", index: "0..49" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_ADDRESS_LOGS(String(address)), selector: `items.${index}.topics.0` })
  },
  {
    name: "address_log_data",
    agent: "json-fetch", fn: "fetchString", category: "logs",
    description: "Raw data field of the N-th log of an address (hex string).",
    args: { address: "0x...", index: "0..49" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_ADDRESS_LOGS(String(address)), selector: `items.${index}.data` })
  },
  {
    name: "address_log_tx_hash",
    agent: "json-fetch", fn: "fetchString", category: "logs",
    description: "Tx hash that emitted the N-th log of an address.",
    args: { address: "0x...", index: "0..49" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_ADDRESS_LOGS(String(address)), selector: `items.${index}.tx_hash` })
  },
  {
    name: "address_log_block_number",
    agent: "json-fetch", fn: "fetchString", category: "logs",
    description: "Block number of the N-th log of an address (decimal string).",
    args: { address: "0x...", index: "0..49" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_ADDRESS_LOGS(String(address)), selector: `items.${index}.block_number` })
  },
  {
    name: "address_internal_tx_to",
    agent: "json-fetch", fn: "fetchString", category: "tx",
    description: "Recipient of the N-th most recent INTERNAL transaction this address was involved in (e.g. a call made BY a contract).",
    args: { address: "0x...", index: "0..49" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_ADDRESS_INTERNAL(String(address)), selector: `items.${index}.to.hash` })
  },
  {
    name: "address_internal_tx_type",
    agent: "json-fetch", fn: "fetchString", category: "tx",
    description: "Type of N-th internal-tx: 'call', 'staticcall', 'delegatecall', 'create', 'create2', 'selfdestruct'.",
    args: { address: "0x...", index: "0..49" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_ADDRESS_INTERNAL(String(address)), selector: `items.${index}.type` })
  },
  {
    name: "address_token_holding_addr",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Address of the N-th token contract held by a wallet (ranked by Blockscout's order).",
    args: { address: "0x...", index: "0..49" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_ADDRESS_TOKENS(String(address)), selector: `items.${index}.token.address` })
  },
  {
    name: "address_token_holding_symbol",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Symbol of the N-th token held by a wallet.",
    args: { address: "0x...", index: "0..49" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_ADDRESS_TOKENS(String(address)), selector: `items.${index}.token.symbol` })
  },
  {
    name: "address_token_holding_amount",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Raw amount of the N-th token held (string — divide by token decimals).",
    args: { address: "0x...", index: "0..49" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_ADDRESS_TOKENS(String(address)), selector: `items.${index}.value` })
  },

  // ── transaction deep-dive (any tx by hash) ──
  {
    name: "tx_full_method_call",
    agent: "json-fetch", fn: "fetchString", category: "tx",
    description: "Decoded method-call summary of a tx by hash (e.g. 'transfer(address,uint256)'). Empty if call data is not decodable without ABI.",
    args: { hash: "0x..." },
    build: ({ hash }) => ({ kind: "fetchString", url: V2_TX(String(hash)), selector: "method" })
  },
  {
    name: "tx_full_status",
    agent: "json-fetch", fn: "fetchString", category: "tx",
    description: "Outcome of a tx: 'success', 'reverted', 'error'.",
    args: { hash: "0x..." },
    build: ({ hash }) => ({ kind: "fetchString", url: V2_TX(String(hash)), selector: "status" })
  },
  {
    name: "tx_full_revert_reason",
    agent: "json-fetch", fn: "fetchString", category: "tx",
    description: "Revert reason string of a reverted tx (decoded if available). Empty if tx succeeded.",
    args: { hash: "0x..." },
    build: ({ hash }) => ({ kind: "fetchString", url: V2_TX(String(hash)), selector: "revert_reason" })
  },
  {
    name: "tx_log_topic0",
    agent: "json-fetch", fn: "fetchString", category: "logs",
    description: "Topic[0] (event signature) of the N-th log emitted by a tx by hash.",
    args: { hash: "0x...", index: "0..N" },
    build: ({ hash, index }) => ({ kind: "fetchString", url: V2_TX_LOGS(String(hash)), selector: `items.${index}.topics.0` })
  },
  {
    name: "tx_log_emitter",
    agent: "json-fetch", fn: "fetchString", category: "logs",
    description: "Address of the contract that emitted the N-th log of a tx.",
    args: { hash: "0x...", index: "0..N" },
    build: ({ hash, index }) => ({ kind: "fetchString", url: V2_TX_LOGS(String(hash)), selector: `items.${index}.address.hash` })
  },
  {
    name: "tx_internal_to",
    agent: "json-fetch", fn: "fetchString", category: "tx",
    description: "Recipient of the N-th internal call inside a tx (proxy delegatecall reveal etc).",
    args: { hash: "0x...", index: "0..N" },
    build: ({ hash, index }) => ({ kind: "fetchString", url: V2_TX_INTERNAL(String(hash)), selector: `items.${index}.to.hash` })
  },
  {
    name: "tx_internal_type",
    agent: "json-fetch", fn: "fetchString", category: "tx",
    description: "Type of N-th internal call: 'call', 'staticcall', 'delegatecall', 'create', 'create2', 'selfdestruct'.",
    args: { hash: "0x...", index: "0..N" },
    build: ({ hash, index }) => ({ kind: "fetchString", url: V2_TX_INTERNAL(String(hash)), selector: `items.${index}.type` })
  },
  {
    name: "tx_token_transfer_token",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Token contract of the N-th token transfer inside a tx (one tx can transfer many tokens — useful for swap detection).",
    args: { hash: "0x...", index: "0..N" },
    build: ({ hash, index }) => ({ kind: "fetchString", url: V2_TX_TOKEN_TRANSFERS(String(hash)), selector: `items.${index}.token.address` })
  },
  {
    name: "tx_token_transfer_amount",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Raw amount of the N-th token transfer inside a tx.",
    args: { hash: "0x...", index: "0..N" },
    build: ({ hash, index }) => ({ kind: "fetchString", url: V2_TX_TOKEN_TRANSFERS(String(hash)), selector: `items.${index}.total.value` })
  },

  // ── chain-wide context ──
  {
    name: "chain_gas_price_average",
    agent: "json-fetch", fn: "fetchString", category: "stats",
    description: "Current average gas price on Somnia (gwei).",
    args: {},
    build: () => ({ kind: "fetchString", url: V2_STATS, selector: "gas_prices.average" })
  },
  {
    name: "chain_average_block_time",
    agent: "json-fetch", fn: "fetchString", category: "stats",
    description: "Current average block time on Somnia (seconds).",
    args: {},
    build: () => ({ kind: "fetchString", url: V2_STATS, selector: "average_block_time" })
  },
  {
    name: "chain_network_utilization",
    agent: "json-fetch", fn: "fetchString", category: "stats",
    description: "Current network utilization percentage (0-100). Signal for chain congestion.",
    args: {},
    build: () => ({ kind: "fetchString", url: V2_STATS, selector: "network_utilization_percentage" })
  },
  {
    name: "chain_gas_used_today",
    agent: "json-fetch", fn: "fetchString", category: "stats",
    description: "Total gas used across the chain today.",
    args: {},
    build: () => ({ kind: "fetchString", url: V2_STATS, selector: "gas_used_today" })
  },
  {
    name: "chain_recent_tx_hash",
    agent: "json-fetch", fn: "fetchString", category: "stats",
    description: "Hash of the N-th most recent transaction across the entire chain. Use to discover hot activity.",
    args: { index: "0..5" },
    build: ({ index }) => ({ kind: "fetchString", url: V2_MAIN_TXS, selector: `${index}.hash` })
  },

  // ── token transfers (entire history of a token) ──
  {
    name: "token_first_transfer_from",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Sender of the N-th most recent transfer of a token (entire history, not wallet-specific).",
    args: { address: "0x... token", index: "0..49" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_TOKEN_TRANSFERS_FULL(String(address)), selector: `items.${index}.from.hash` })
  },
  {
    name: "token_first_transfer_to",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Recipient of the N-th most recent transfer of a token (entire history).",
    args: { address: "0x... token", index: "0..49" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_TOKEN_TRANSFERS_FULL(String(address)), selector: `items.${index}.to.hash` })
  },
  {
    name: "token_first_transfer_amount",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Amount (raw) of the N-th token transfer.",
    args: { address: "0x... token", index: "0..49" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_TOKEN_TRANSFERS_FULL(String(address)), selector: `items.${index}.total.value` })
  },
  {
    name: "token_holders_v2_value",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Balance held by the N-th top holder (entire holder list, not capped at 50).",
    args: { address: "0x... token", index: "0..N" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_TOKEN_HOLDERS_FULL(String(address)), selector: `items.${index}.value` })
  },
  {
    name: "token_holders_v2_address",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Address of the N-th top holder of a token (entire ranking).",
    args: { address: "0x... token", index: "0..N" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_TOKEN_HOLDERS_FULL(String(address)), selector: `items.${index}.address.hash` })
  },

  // ── coin balance history (financial activity timeline) ──
  {
    name: "balance_history_value",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Native balance (wei) of an address AT the time of the N-th most recent balance-changing event.",
    args: { address: "0x...", index: "0..49" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_BALANCE_HISTORY(String(address)), selector: `items.${index}.value` })
  },
  {
    name: "balance_history_delta",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Signed change in balance (wei) for the N-th balance event. Positive = inflow, negative = outflow.",
    args: { address: "0x...", index: "0..49" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_BALANCE_HISTORY(String(address)), selector: `items.${index}.delta` })
  },
  {
    name: "balance_history_tx",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Tx hash that caused the N-th balance change.",
    args: { address: "0x...", index: "0..49" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_BALANCE_HISTORY(String(address)), selector: `items.${index}.transaction_hash` })
  },
  {
    name: "balance_history_timestamp",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "ISO-8601 timestamp of the N-th balance change.",
    args: { address: "0x...", index: "0..49" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_BALANCE_HISTORY(String(address)), selector: `items.${index}.block_timestamp` })
  },
  {
    name: "balance_daily_value",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Daily balance snapshot (wei) — N-th most recent day. Use for trend graphs.",
    args: { address: "0x...", index: "0..9" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_BALANCE_DAILY(String(address)), selector: `items.${index}.value` })
  },
  {
    name: "balance_daily_date",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Date (YYYY-MM-DD) for the N-th daily balance snapshot.",
    args: { address: "0x...", index: "0..9" },
    build: ({ address, index }) => ({ kind: "fetchString", url: V2_BALANCE_DAILY(String(address)), selector: `items.${index}.date` })
  },

  // ── block-level analytics ──
  {
    name: "chain_latest_block_height",
    agent: "json-fetch", fn: "fetchString", category: "stats",
    description: "Height of the latest mined block on Somnia.",
    args: {},
    build: () => ({ kind: "fetchString", url: V2_BLOCKS, selector: "items.0.height" })
  },
  {
    name: "chain_latest_block_gas_used",
    agent: "json-fetch", fn: "fetchString", category: "stats",
    description: "Gas used by the latest mined block.",
    args: {},
    build: () => ({ kind: "fetchString", url: V2_BLOCKS, selector: "items.0.gas_used" })
  },
  {
    name: "chain_latest_block_burnt",
    agent: "json-fetch", fn: "fetchString", category: "stats",
    description: "Burnt fees in the latest block (wei).",
    args: {},
    build: () => ({ kind: "fetchString", url: V2_BLOCKS, selector: "items.0.burnt_fees" })
  },
  {
    name: "block_tx_count",
    agent: "json-fetch", fn: "fetchString", category: "stats",
    description: "Number of transactions in a specific block (by height).",
    args: { height: "block number" },
    build: ({ height }) => ({ kind: "fetchString", url: V2_BLOCK(String(height)), selector: "tx_count" })
  },
  {
    name: "block_timestamp",
    agent: "json-fetch", fn: "fetchString", category: "stats",
    description: "ISO timestamp of a specific block.",
    args: { height: "block number" },
    build: ({ height }) => ({ kind: "fetchString", url: V2_BLOCK(String(height)), selector: "timestamp" })
  },
  {
    name: "block_miner",
    agent: "json-fetch", fn: "fetchString", category: "stats",
    description: "Miner / validator address of a specific block.",
    args: { height: "block number" },
    build: ({ height }) => ({ kind: "fetchString", url: V2_BLOCK(String(height)), selector: "miner.hash" })
  },
  {
    name: "block_tx_hash",
    agent: "json-fetch", fn: "fetchString", category: "stats",
    description: "Hash of the N-th transaction in a specific block.",
    args: { height: "block number", index: "0..N" },
    build: ({ height, index }) => ({ kind: "fetchString", url: V2_BLOCK_TXS(String(height)), selector: `items.${index}.hash` })
  },

  // ── search / discovery ──
  {
    name: "search_top_match_type",
    agent: "json-fetch", fn: "fetchString", category: "stats",
    description: "Search Shannon Explorer for a query (address fragment, token name, tx hash, block height) and return the top match TYPE (address|contract|token|transaction|block).",
    args: { query: "anything" },
    build: ({ query }) => ({ kind: "fetchString", url: V2_SEARCH(String(query)), selector: "items.0.type" })
  },
  {
    name: "search_top_match_address",
    agent: "json-fetch", fn: "fetchString", category: "stats",
    description: "Search Shannon Explorer for a query and return the top match's address/hash.",
    args: { query: "anything" },
    build: ({ query }) => ({ kind: "fetchString", url: V2_SEARCH(String(query)), selector: "items.0.address" })
  },
  {
    name: "search_top_match_name",
    agent: "json-fetch", fn: "fetchString", category: "stats",
    description: "Search Shannon Explorer — top match's display name (e.g. for a token).",
    args: { query: "anything" },
    build: ({ query }) => ({ kind: "fetchString", url: V2_SEARCH(String(query)), selector: "items.0.name" })
  },
  {
    name: "discover_recent_verified_contract",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "Address of the N-th most recently VERIFIED contract on Somnia — useful for 'what's new being built'.",
    args: { index: "0..49" },
    build: ({ index }) => ({ kind: "fetchString", url: V2_VERIFIED_CONTRACTS, selector: `items.${index}.address.hash` })
  },
  {
    name: "discover_recent_verified_name",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "Name of the N-th most recently verified contract.",
    args: { index: "0..49" },
    build: ({ index }) => ({ kind: "fetchString", url: V2_VERIFIED_CONTRACTS, selector: `items.${index}.coin_balance` })
  },
  {
    name: "discover_top_token_addr",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Address of the N-th most popular token on Somnia (by holder count or activity).",
    args: { index: "0..49" },
    build: ({ index }) => ({ kind: "fetchString", url: V2_TOKENS_LIST, selector: `items.${index}.address` })
  },
  {
    name: "discover_top_token_name",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Name of the N-th top token.",
    args: { index: "0..49" },
    build: ({ index }) => ({ kind: "fetchString", url: V2_TOKENS_LIST, selector: `items.${index}.name` })
  },

  // ── outgoing-only / address tx-feed scoped ──
  {
    name: "address_outgoing_tx_hash",
    agent: "json-fetch", fn: "fetchString", category: "tx",
    description: "Hash of the N-th tx where the address is the SENDER (filter=to:not = sender-only feed).",
    args: { address: "0x...", index: "0..N" },
    build: ({ address, index }) => ({
      kind: "fetchString",
      url: `${EXPLORER_V2_BASE}/addresses/${address}/transactions?filter=from`,
      selector: `items.${index}.hash`
    })
  },
  {
    name: "address_incoming_tx_hash",
    agent: "json-fetch", fn: "fetchString", category: "tx",
    description: "Hash of the N-th tx where the address is the RECEIVER.",
    args: { address: "0x...", index: "0..N" },
    build: ({ address, index }) => ({
      kind: "fetchString",
      url: `${EXPLORER_V2_BASE}/addresses/${address}/transactions?filter=to`,
      selector: `items.${index}.hash`
    })
  },

  // ── withdrawals (PoS payouts, if chain supports) ──
  {
    name: "address_withdrawals_count",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Number of withdrawal items received by the address.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchUint", url: V2_ADDRESS_WITHDRAWALS(String(address)), selector: "items.length", decimals: 0 })
  },
  {
    name: "address_blocks_validated_count",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Number of recent blocks this address has validated (validator-only signal).",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: V2_ADDRESS_BLOCKS_VALIDATED(String(address)), selector: "items.length" })
  },

  // ── 4byte function-selector decoder ────────────────────────
  // Turns a raw 4-byte selector like 0x62e32e87 into its human signature
  // (e.g. "claim()", "withdraw(uint256)"). Critical for unverified contracts
  // and for understanding any tx_method_id result.
  {
    name: "method_label",
    agent: "json-fetch", fn: "fetchString", category: "tx",
    description: "Look up a 4-byte function selector in the open 4byte directory. Returns the textual signature (e.g. 'transfer(address,uint256)'). If a selector has multiple matches (collision), pass index 0/1/2 to pick which one. Empty if unknown.",
    args: { selector: "0xa9059cbb (4 bytes)", index: "0 (or 1,2,…)" },
    build: ({ selector, index }) => ({
      kind: "fetchString",
      url: FOURBYTE(String(selector)),
      selector: `results.${index ?? 0}.text_signature`
    })
  },
  {
    name: "method_label_match_count",
    agent: "json-fetch", fn: "fetchUint", category: "tx",
    description: "How many text signatures collide on a given 4-byte selector. Useful before deciding which method_label index to trust.",
    args: { selector: "0x..." },
    build: ({ selector }) => ({
      kind: "fetchUint",
      url: FOURBYTE(String(selector)),
      selector: "count",
      decimals: 0
    })
  },

  // ── NFT-specific (ERC-721 / ERC-1155 instances) ────────────
  {
    name: "nft_owner_of",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Owner address of a specific NFT (contract + token_id). Empty if token doesn't exist.",
    args: { contract: "0x... NFT contract", token_id: "1234" },
    build: ({ contract, token_id }) => ({
      kind: "fetchString",
      url: V2_NFT_INSTANCE(String(contract), token_id),
      selector: "owner.hash"
    })
  },
  {
    name: "nft_token_uri",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "tokenURI / image_url for an NFT instance — the off-chain metadata pointer (usually IPFS/HTTP).",
    args: { contract: "0x...", token_id: "1234" },
    build: ({ contract, token_id }) => ({
      kind: "fetchString",
      url: V2_NFT_INSTANCE(String(contract), token_id),
      selector: "image_url"
    })
  },
  {
    name: "nft_metadata_name",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Display name of an NFT instance from its metadata.",
    args: { contract: "0x...", token_id: "1234" },
    build: ({ contract, token_id }) => ({
      kind: "fetchString",
      url: V2_NFT_INSTANCE(String(contract), token_id),
      selector: "metadata.name"
    })
  },
  {
    name: "nft_metadata_description",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Description from NFT metadata.",
    args: { contract: "0x...", token_id: "1234" },
    build: ({ contract, token_id }) => ({
      kind: "fetchString",
      url: V2_NFT_INSTANCE(String(contract), token_id),
      selector: "metadata.description"
    })
  },

  // ── web2 enrichment via llm-parse-website ──────────────────
  // These let the swarm reach out beyond on-chain data: OpenSea profiles,
  // GitHub READMEs, project landing pages, twitter handles, etc.
  {
    name: "web_extract_field",
    agent: "llm-parse-website", fn: "ExtractString", category: "web",
    description: "Use a real browser to fetch a URL and ask the page LLM to extract ONE specific field. Use for OpenSea/GitHub/project sites.",
    args: { url: "https://...", question: "natural-language question", key: "name|owner|symbol|etc" },
    build: ({ url, question, key }) => ({
      kind: "ExtractString",
      key: String(key),
      description: `Extract ${key} from the page.`,
      options: [],
      prompt: String(question),
      url: String(url),
      resolveUrl: false,
      numPages: 1
    })
  },
  {
    name: "web_search_field",
    agent: "llm-parse-website", fn: "ExtractString", category: "web",
    description: "Search inside a domain (not a single URL) and extract a field. Pass a domain like 'opensea.io' as url + a search query as prompt.",
    args: { domain: "opensea.io | github.com | etc", query: "search terms", key: "what to extract" },
    build: ({ domain, query, key }) => ({
      kind: "ExtractString",
      key: String(key),
      description: `Find ${key} via search on ${domain}.`,
      options: [],
      prompt: String(query),
      url: String(domain),
      resolveUrl: true,
      numPages: 2
    })
  },
  {
    name: "web_extract_choice",
    agent: "llm-parse-website", fn: "ExtractString", category: "web",
    description: "Like web_extract_field but constrains the LLM's answer to a fixed enum (pass `options` comma-separated).",
    args: { url: "https://...", question: "natural-language q", key: "field key", options: "comma,separated,values" },
    build: ({ url, question, key, options }) => ({
      kind: "ExtractString",
      key: String(key),
      description: `Pick ${key} from ${String(options)}.`,
      options: String(options).split(",").map((s) => s.trim()),
      prompt: String(question),
      url: String(url),
      resolveUrl: false,
      numPages: 1
    })
  },

  // ── cross-platform identity (web2 surface for a wallet) ────
  // Each is a specialised web_search_field with a domain + question pre-baked.
  {
    name: "identity_opensea",
    agent: "llm-parse-website", fn: "ExtractString", category: "identity",
    description: "Look up an address on OpenSea to find their username and displayed profile name.",
    args: { address: "0x..." },
    build: ({ address }) => ({
      kind: "ExtractString",
      key: "username",
      description: "OpenSea username for the address",
      options: [],
      prompt: `Search OpenSea for wallet ${address} and return their username if visible.`,
      url: "opensea.io",
      resolveUrl: true,
      numPages: 2
    })
  },
  {
    name: "identity_farcaster",
    agent: "llm-parse-website", fn: "ExtractString", category: "identity",
    description: "Look up the address on Warpcast (Farcaster) to find their @handle.",
    args: { address: "0x..." },
    build: ({ address }) => ({
      kind: "ExtractString",
      key: "handle",
      description: "Farcaster handle linked to the address",
      options: [],
      prompt: `Search Warpcast / Farcaster for wallet ${address} and return their @handle.`,
      url: "warpcast.com",
      resolveUrl: true,
      numPages: 2
    })
  },
  {
    name: "identity_lens",
    agent: "llm-parse-website", fn: "ExtractString", category: "identity",
    description: "Look up the address on Lens Protocol to find their .lens handle.",
    args: { address: "0x..." },
    build: ({ address }) => ({
      kind: "ExtractString",
      key: "handle",
      description: "Lens handle for the address",
      options: [],
      prompt: `Search Lens Protocol for wallet ${address} and return their .lens handle.`,
      url: "hey.xyz",
      resolveUrl: true,
      numPages: 2
    })
  },
  {
    name: "identity_snapshot_votes",
    agent: "llm-parse-website", fn: "ExtractString", category: "identity",
    description: "Look up the address on Snapshot to find DAOs they've voted in.",
    args: { address: "0x..." },
    build: ({ address }) => ({
      kind: "ExtractString",
      key: "daos",
      description: "List of DAO names the address has voted in on Snapshot",
      options: [],
      prompt: `Find Snapshot voting history for ${address}. Return the DAO names.`,
      url: "snapshot.org",
      resolveUrl: true,
      numPages: 2
    })
  },
  {
    name: "identity_gitcoin",
    agent: "llm-parse-website", fn: "ExtractString", category: "identity",
    description: "Look up the address on Gitcoin Passport / grants to find contribution history.",
    args: { address: "0x..." },
    build: ({ address }) => ({
      kind: "ExtractString",
      key: "passport",
      description: "Gitcoin Passport stamps or grant history",
      options: [],
      prompt: `Find Gitcoin Passport / grants activity for wallet ${address}.`,
      url: "passport.gitcoin.co",
      resolveUrl: true,
      numPages: 2
    })
  },
  {
    name: "identity_galxe",
    agent: "llm-parse-website", fn: "ExtractString", category: "identity",
    description: "Look up the address on Galxe (formerly Project Galaxy) for quest/credential history.",
    args: { address: "0x..." },
    build: ({ address }) => ({
      kind: "ExtractString",
      key: "credentials",
      description: "Galxe credentials or quest completion history",
      options: [],
      prompt: `Find Galxe credentials for ${address}.`,
      url: "galxe.com",
      resolveUrl: true,
      numPages: 2
    })
  },
  {
    name: "identity_ens_app",
    agent: "llm-parse-website", fn: "ExtractString", category: "identity",
    description: "Look up the address on ens.domains app to find any associated domain.",
    args: { address: "0x..." },
    build: ({ address }) => ({
      kind: "ExtractString",
      key: "ens",
      description: "ENS or domain associated with the address",
      options: [],
      prompt: `Find ENS or domain for wallet ${address}.`,
      url: "app.ens.domains",
      resolveUrl: true,
      numPages: 2
    })
  },

  // ── Identity aggregator (proxies our /api/identity/[addr]) ──
  // Probes OpenSea / ENSIdeas / ENS-subgraph / Farcaster / Lens / Mirror /
  // Galxe in parallel server-side and returns ONE deterministic JSON. This
  // is the production-grade fix for the flaky on-chain ExtractString path:
  // all 3 Somnia validators hit the same URL and see identical bytes →
  // consensus succeeds.
  {
    name: "identity_best",
    agent: "json-fetch", fn: "fetchString", category: "identity",
    description: "BEST on-chain identity handle (ENS > OpenSea > Lens > Farcaster > Mirror > Galxe). 'null' if wallet has no public handle anywhere.",
    args: { address: "0x... wallet" },
    build: ({ address }) => ({ kind: "fetchString", url: IDENTITY_AGG(String(address)), selector: "best" })
  },
  {
    name: "identity_hits",
    agent: "json-fetch", fn: "fetchString", category: "identity",
    description: "How many of the 7 identity sources returned a handle. 0 = no public web-3 identity anywhere.",
    args: { address: "0x... wallet" },
    build: ({ address }) => ({ kind: "fetchString", url: IDENTITY_AGG(String(address)), selector: "hits" })
  },
  {
    name: "identity_opensea_handle",
    agent: "json-fetch", fn: "fetchString", category: "identity",
    description: "OpenSea username for the wallet (deterministic — read from our server-side scrape).",
    args: { address: "0x... wallet" },
    build: ({ address }) => ({ kind: "fetchString", url: IDENTITY_AGG(String(address)), selector: "results.opensea" })
  },
  {
    name: "identity_ens_resolved",
    agent: "json-fetch", fn: "fetchString", category: "identity",
    description: "Primary ENS name for the wallet (via api.ensideas.com).",
    args: { address: "0x... wallet" },
    build: ({ address }) => ({ kind: "fetchString", url: IDENTITY_AGG(String(address)), selector: "results.ensideas" })
  },
  {
    name: "identity_farcaster_handle",
    agent: "json-fetch", fn: "fetchString", category: "identity",
    description: "Farcaster username (Warpcast).",
    args: { address: "0x... wallet" },
    build: ({ address }) => ({ kind: "fetchString", url: IDENTITY_AGG(String(address)), selector: "results.farcaster" })
  },
  {
    name: "identity_lens_handle",
    agent: "json-fetch", fn: "fetchString", category: "identity",
    description: "Lens v3 fullHandle for the wallet.",
    args: { address: "0x... wallet" },
    build: ({ address }) => ({ kind: "fetchString", url: IDENTITY_AGG(String(address)), selector: "results.lens" })
  },
  {
    name: "identity_mirror_handle",
    agent: "json-fetch", fn: "fetchString", category: "identity",
    description: "Mirror.xyz blog display name.",
    args: { address: "0x... wallet" },
    build: ({ address }) => ({ kind: "fetchString", url: IDENTITY_AGG(String(address)), selector: "results.mirror" })
  },
  {
    name: "identity_galxe_handle",
    agent: "json-fetch", fn: "fetchString", category: "identity",
    description: "Galxe quest-platform username.",
    args: { address: "0x... wallet" },
    build: ({ address }) => ({ kind: "fetchString", url: IDENTITY_AGG(String(address)), selector: "results.galxe" })
  },

  // ── Funding-trail tools ──
  // When a creator/deployer wallet is "fresh" (low tx count, recent first
  // activity, no identity hit), follow the money one hop back — who funded
  // this wallet? That funder is often an older, identifiable wallet (their
  // dev hot-wallet, a CEX deposit, or a known multisig). Apply the same
  // identity probe on the funder to lift the veil.
  {
    name: "address_first_tx_funder",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Sender of the wallet's FIRST incoming transaction — typically the funder. Identity-check this address next.",
    args: { address: "0x... target wallet" },
    build: ({ address }) => ({ kind: "fetchString", url: TXLIST_FIRST(String(address), 1), selector: "result.0.from" })
  },
  {
    name: "address_first_tx_hash",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Hash of the wallet's first tx (oldest).",
    args: { address: "0x... wallet" },
    build: ({ address }) => ({ kind: "fetchString", url: TXLIST_FIRST(String(address), 1), selector: "result.0.hash" })
  },
  {
    name: "address_first_tx_timestamp",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Unix timestamp of the wallet's first tx — tells you wallet age and freshness.",
    args: { address: "0x... wallet" },
    build: ({ address }) => ({ kind: "fetchString", url: TXLIST_FIRST(String(address), 1), selector: "result.0.timeStamp" })
  },
  {
    name: "address_first_tx_value",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Native value (wei) of the first incoming tx — funding amount.",
    args: { address: "0x... wallet" },
    build: ({ address }) => ({ kind: "fetchString", url: TXLIST_FIRST(String(address), 1), selector: "result.0.value" })
  },
  {
    name: "address_second_funder",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Sender of the wallet's SECOND incoming tx — useful if first funder is a CEX (dead-end) and we want a secondary lead.",
    args: { address: "0x... wallet" },
    build: ({ address }) => ({ kind: "fetchString", url: TXLIST_FIRST(String(address), 2), selector: "result.1.from" })
  },
  {
    name: "address_internal_first_funder",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "First INTERNAL (contract-originated) funding source — catches wallets bootstrapped via factory or multisig.",
    args: { address: "0x... wallet" },
    build: ({ address }) => ({ kind: "fetchString", url: INTERNAL_FIRST(String(address), 1), selector: "result.0.from" })
  },

  // ── Smart-aggregator on-chain tools ──
  // Each tool = ONE on-chain Somnia json-fetch dispatch. The URL points to
  // OUR public /api/snapshot/[addr] route which pre-aggregates 8 Blockscout
  // queries server-side and returns a compact <500-char `summary` field
  // the validators can consensus on quickly. Real receipt on agent platform,
  // real STT spent, real on-chain agentic flow — just with a smart data
  // provider that pre-digests the upstream so consensus payload is small.
  // contract_snapshot / wallet_snapshot are now thin aliases over this.
  {
    name: "contract_snapshot",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "One on-chain dispatch returning a compact summary: name | compiler | is_proxy | creator | balance | total_txs | source_bytes. Receipt on Somnia.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: SNAPSHOT_AGG(String(address)), selector: "summary" })
  },
  {
    name: "wallet_snapshot",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "One on-chain dispatch: balance | total_txs | is_contract | ens | public_name. Same receipt model as above.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: SNAPSHOT_AGG(String(address)), selector: "summary" })
  },
  {
    name: "identity_summary",
    agent: "json-fetch", fn: "fetchString", category: "identity",
    description: "One on-chain dispatch returning every web-3 handle: 'Shiny11111 (opensea); vitalik.eth (ens); …'. Receipt on Somnia.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: IDENTITY_AGG(String(address)), selector: "summary" })
  },
  {
    name: "contract_owner",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "THE answer to 'who owns/controls this'. Reads owner()/admin()/houseManager()/governance()/creator on-chain AND resolves each one's identity (OpenSea, X/Twitter, ENS). e.g. 'owner=0x3fFa… (Shiny11111 opensea, ShinyViq x_twitter)'. One dispatch.",
    args: { address: "0x... contract" },
    build: ({ address }) => ({ kind: "fetchString", url: OWNER_AGG(String(address)), selector: "summary" })
  },
  {
    name: "view_call",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "UNIVERSAL: read ANY view/pure function of ANY contract by signature. sig like 'getReserves()' or 'balanceOf(address)'; args = comma-separated values (omit if none). Examples: view_call(to, 'totalSupply()'), view_call(pool, 'getReserves()'), view_call(token, 'balanceOf(address)', '0xWALLET'), view_call(vesting, 'released()'). The skeleton key for any on-chain state.",
    args: { to: "0x... contract", sig: "fn signature e.g. balanceOf(address)", args: "comma-separated args or empty" },
    build: ({ to, sig, args }) => ({ kind: "fetchString", url: CALL_AGG(String(to), String(sig || ""), String(args || "")), selector: "summary" })
  },
  {
    name: "discover",
    agent: "json-fetch", fn: "fetchString", category: "stats",
    description: "DISCOVERY / find-things-by-criterion (not by address). kind='fresh' (recently-verified contracts = who's building, set days=7), kind='trending' (fresh contracts ranked by balance + recency), kind='tokens' (top tokens by holders), kind='search' (full-text find by name, needs q). Use for 'top projects this week', 'newest contracts', 'find X protocol'.",
    args: { kind: "fresh|trending|tokens|search", q: "search query (only for kind=search)", days: "window in days (fresh/trending), default 7" },
    build: ({ kind, q, days }) => ({ kind: "fetchString", url: DISCOVER_AGG(String(kind || "fresh"), String(q || ""), String(days || "")), selector: "summary" })
  },
  {
    name: "active",
    agent: "json-fetch", fn: "fetchString", category: "stats",
    description: "MOST ACTIVE contracts right now — tallies the live transaction feed and ranks destination contracts by how many recent txs hit them. THE tool for 'top contracts by transactions', 'what's busiest', 'most used contracts'. Returns a ranked list with names + a sample-window note (it samples recent txs, not an exact calendar window).",
    args: { pages: "how many tx-feed pages to sample, 1-8 (default 4)" },
    build: ({ pages }) => ({ kind: "fetchString", url: ACTIVE_AGG(String(pages || "")), selector: "summary" })
  },
  {
    name: "explorer",
    agent: "json-fetch", fn: "fetchString", category: "stats",
    description:
      "UNIVERSAL EXPLORER ACCESS — the skeleton key for ANY on-chain data question. Fetches ANY Blockscout v2 endpoint and extracts a value by dot-path selector. Use when no named tool fits. PATHS (Somnia Blockscout v2): " +
      "addresses/{a} · addresses/{a}/transactions · addresses/{a}/token-transfers · addresses/{a}/internal-transactions · addresses/{a}/logs · addresses/{a}/token-balances · addresses/{a}/coin-balance-history-by-day · addresses/{a}/withdrawals · " +
      "tokens/{a} · tokens/{a}/holders · tokens/{a}/transfers · tokens/{a}/counters · tokens?type=ERC-20 · " +
      "transactions/{hash} · transactions/{hash}/logs · transactions/{hash}/token-transfers · transactions · main-page/transactions · " +
      "blocks/{n} · blocks · stats · stats/charts/transactions · search?q={query}. " +
      "SELECTOR is a dot-path into the JSON, e.g. 'items.0.hash', 'coin_balance', 'total_supply', 'items.2.to.hash', 'holders_count'. " +
      "Examples: explorer('stats','total_transactions'); explorer('tokens/0xABC/holders','items.0.value'); explorer('addresses/0xABC/withdrawals','items.0.amount').",
    args: { path: "Blockscout v2 path, e.g. addresses/0x..  or  stats", selector: "dot-path into the JSON, e.g. items.0.hash" },
    build: ({ path, selector }) => ({ kind: "fetchString", url: EXPLORER_PATH(String(path || "")), selector: String(selector || "") })
  },
  {
    name: "web",
    agent: "json-fetch", fn: "fetchString", category: "web",
    description:
      "UNIVERSAL WEB FETCH — GET any public JSON API and extract a value by dot-path selector. For OFF-CHAIN context the explorer can't give: token prices (e.g. CoinGecko), protocol docs/registries, GitHub repo metadata, gas oracles, any public REST API. url may omit https://. selector is a dot-path into the response JSON. Example: web('api.coingecko.com/api/v3/simple/price?ids=somnia&vs_currencies=usd','somnia.usd').",
    args: { url: "full https URL of a public JSON API", selector: "dot-path into the response JSON" },
    build: ({ url, selector }) => ({ kind: "fetchString", url: WEB_URL(String(url || "")), selector: String(selector || "") })
  },
  {
    name: "classify",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "What TYPE is this contract? Probes interfaces (ERC20/721/1155/proxy/AMM-pool/multisig/royalty) via on-chain calls — works even for UNVERIFIED contracts. e.g. 'type=ERC20 | proxy=no'.",
    args: { address: "0x... contract" },
    build: ({ address }) => ({ kind: "fetchString", url: CLASSIFY_AGG(String(address)), selector: "summary" })
  },
  {
    name: "approvals",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Token-approval scanner — the #1 wallet-drain vector. Lists active approvals and flags UNLIMITED ones + unverified spenders. Essential for 'is my wallet safe', 'what did I approve'.",
    args: { address: "0x... wallet" },
    build: ({ address }) => ({ kind: "fetchString", url: APPROVALS_AGG(String(address)), selector: "summary" })
  },
  {
    name: "flow",
    agent: "json-fetch", fn: "fetchString", category: "tx",
    description: "Fund-flow: top inflow sources + outflow destinations + net direction (net receiver/spender) with labels. Answers 'where did the money go / come from'.",
    args: { address: "0x... wallet" },
    build: ({ address }) => ({ kind: "fetchString", url: FLOW_AGG(String(address)), selector: "summary" })
  },
  {
    name: "safety",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "Aggregated risk score 0-100 (higher=riskier) for any address: scam flag, verified?, upgradeable proxy?, age/activity, labels. e.g. 'score=72/100 (HIGH) · risks: unverified; upgradeable'.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: SAFETY_AGG(String(address)), selector: "summary" })
  },
  {
    name: "clones",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "Bytecode fingerprint + fork/clone detector. Returns codehash + flags EIP-1167 minimal-proxy clones (and their implementation). For 'is this a fork', 'is this a proxy clone'.",
    args: { address: "0x... contract" },
    build: ({ address }) => ({ kind: "fetchString", url: CLONES_AGG(String(address)), selector: "summary" })
  },
  {
    name: "compare",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Are two addresses LINKED / the same person? Checks shared creator, shared first-funder, direct transfers, shared counterparties. For 'is wallet A connected to B', 'same owner?'.",
    args: { a: "0x... first address", b: "0x... second address" },
    build: ({ a, b }) => ({ kind: "fetchString", url: COMPARE_AGG(String(a), String(b)), selector: "summary" })
  },
  {
    name: "events",
    agent: "json-fetch", fn: "fetchString", category: "logs",
    description: "Human-readable recent event feed of a contract — decoded as 'Transfer×6; Swap×3; OwnershipTransferred'. Answers 'what has this contract been doing'.",
    args: { address: "0x... contract" },
    build: ({ address }) => ({ kind: "fetchString", url: EVENTS_AGG(String(address)), selector: "summary" })
  },
  {
    name: "resolve",
    agent: "json-fetch", fn: "fetchString", category: "identity",
    description: "NAME → address (and reverse). Type a name not an address: 'vitalik.eth', 'SomniaExchange', or a 0x to reverse-resolve its label. Use FIRST when the user names a target by word instead of hex.",
    args: { q: "name, ENS, or 0x address" },
    build: ({ q }) => ({ kind: "fetchString", url: RESOLVE_AGG(String(q)), selector: "summary" })
  },
  {
    name: "nft",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "NFT collection analyzer: name, supply, holder count, top-holder concentration %, royalty %. For 'analyze this NFT collection', 'how concentrated is this drop'.",
    args: { address: "0x... NFT contract" },
    build: ({ address }) => ({ kind: "fetchString", url: NFT_AGG(String(address)), selector: "summary" })
  },
  {
    name: "timeline",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Chronological profile: first-seen + age, last-active + dormancy, tx cadence (one-shot/dormant/active), genesis counterparty. For 'when did this wake up', 'is it still active'.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: TIMELINE_AGG(String(address)), selector: "summary" })
  },
  {
    name: "selectors",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "REVERSE-ENGINEER an UNVERIFIED contract: extracts function selectors from bytecode and resolves them to signatures via 4byte — recovers the callable ABI with NO source. Flags withdraw/mint/blacklist/upgrade. For 'what can this black-box contract do'.",
    args: { address: "0x... contract" },
    build: ({ address }) => ({ kind: "fetchString", url: SELECTORS_AGG(String(address)), selector: "summary" })
  },
  {
    name: "bytecode_scan",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "Static OPCODE analysis of unverified bytecode: DELEGATECALL/SELFDESTRUCT/CREATE/CALL/SSTORE counts → flags proxy, self-destructible, factory, high external-call surface. Danger surface without source.",
    args: { address: "0x... contract" },
    build: ({ address }) => ({ kind: "fetchString", url: BYTESCAN_AGG(String(address)), selector: "summary" })
  },
  {
    name: "honeypot",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "CAN YOU SELL IT? Honeypot/rug detector for tokens: scans for blacklist/setFee/pause hooks, extreme sell tax, single-holder exit-liquidity trap. Returns 0-100 risk + sellable verdict. Essential before buying any token.",
    args: { address: "0x... token" },
    build: ({ address }) => ({ kind: "fetchString", url: HONEYPOT_AGG(String(address)), selector: "summary" })
  },
  {
    name: "storage",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "Read a raw STORAGE slot of any contract (hidden state even when unverified). slot = number, hex, or name (impl|admin|beacon for EIP-1967 proxy slots). e.g. storage(addr,'0') often = owner; storage(addr,'impl') = proxy logic.",
    args: { address: "0x... contract", slot: "slot number, hex, or impl|admin|beacon" },
    build: ({ address, slot }) => ({ kind: "fetchString", url: STORAGE_AGG(String(address), String(slot || "0")), selector: "summary" })
  },
  {
    name: "distribution",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "Token decentralization analysis: top-1/3/10 concentration %, Nakamoto coefficient, whale labels (DEX/treasury/vesting). Answers 'is this whale-controlled', 'where are team/community tokens', 'how fair is the distribution'.",
    args: { address: "0x... token" },
    build: ({ address }) => ({ kind: "fetchString", url: DISTRIBUTION_AGG(String(address)), selector: "summary" })
  },
  {
    name: "wealth",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Full portfolio of a wallet: native STT + every ERC-20 holding (with symbol) + NFT collection count, ranked. For 'how rich is this wallet', 'what does it hold'.",
    args: { address: "0x... wallet" },
    build: ({ address }) => ({ kind: "fetchString", url: WEALTH_AGG(String(address)), selector: "summary" })
  },
  {
    name: "archetype",
    agent: "json-fetch", fn: "fetchString", category: "account",
    description: "Behavioural classification: deployer / high-frequency bot / whale / hub (CEX-router-like) / fresh-burner / dormant. Infers WHAT KIND of actor an address is from its activity pattern.",
    args: { address: "0x..." },
    build: ({ address }) => ({ kind: "fetchString", url: ARCHETYPE_AGG(String(address)), selector: "summary" })
  },
  {
    name: "upgrades",
    agent: "json-fetch", fn: "fetchString", category: "contract",
    description: "Proxy upgrade analysis: current implementation (+ name), admin (EOA single-key ⚠ vs contract), and count of past Upgraded events. Answers 'is this upgradeable', 'who can change the logic', 'has it been upgraded'.",
    args: { address: "0x... proxy contract" },
    build: ({ address }) => ({ kind: "fetchString", url: UPGRADES_AGG(String(address)), selector: "summary" })
  },
  {
    name: "tx_snapshot",
    agent: "json-fetch", fn: "fetchString", category: "tx",
    description: "One on-chain dispatch — full tx summary: from | to | value | method | status | block | gas. Receipt on Somnia.",
    args: { hash: "0x... (32-byte tx hash)" },
    build: ({ hash }) => ({ kind: "fetchString", url: SNAPSHOT_TX(String(hash)), selector: "summary" })
  },
  {
    name: "token_snapshot",
    agent: "json-fetch", fn: "fetchString", category: "token",
    description: "One on-chain dispatch — full ERC20/721 summary: name | symbol | supply | decimals | holders | top_holder. Receipt on Somnia.",
    args: { address: "0x... (token contract)" },
    build: ({ address }) => ({ kind: "fetchString", url: SNAPSHOT_TOKEN(String(address)), selector: "summary" })
  },
  // No composite tools remain — every tool is a SINGLE on-chain Somnia
  // dispatch, returning a small `summary` string from our smart endpoints.
  // The composite kind type stays defined in BuiltTool for backward-compat
  // reading by orchestrator code, but isn't generated anywhere now.
];

export const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

/** Compact catalogue for the planner LLM. Grouped by category for readability. */
export function renderToolsCatalogue(): string {
  return renderToolsCatalogueFor(null);
}

/**
 * Intent-filtered catalogue, ULTRA compact mode.
 *
 * Total payload budget for inferString.system seems to top out around 8–10 KB
 * including ABI overhead. Catalogue alone has been growing past that as we add
 * tools (now 124+). We compress aggressively:
 *
 *  - One line per tool: `name(a,b)` (no description by default)
 *  - Intent picks a HARD-CAPPED subset of tools (most relevant 20-30)
 *  - Descriptions only for the top "essentials" per intent
 */
/**
 * UNIVERSAL CORE — the highest-leverage tools, ALWAYS available in every
 * catalogue regardless of intent, always with a description. These cover the
 * ~80% of any investigation: full snapshots, identity (all socials in one),
 * provenance (creator/funder), and labelling. The agent reaches these for ANY
 * question, so the product adapts to thousands of contexts instead of being
 * caged by 7 fixed intent buckets. Intent only ADDS specialized tools.
 */
const UNIVERSAL_CORE: string[] = [
  "view_call",            // ★ read ANY view fn of ANY contract by signature — the skeleton key
  "contract_owner",       // who owns/controls — reads owner()/admin()/… + resolves their identity
  "identity_summary",     // EVERY connected handle: opensea, X/twitter, ENS, lens, farcaster, ...
  "contract_snapshot",    // name + compiler + proxy + creator + source size, 1 dispatch
  "wallet_snapshot",      // balance + tx count + is_contract + ens + public_name, 1 dispatch
  "token_snapshot",       // ERC20/721 name + symbol + supply + holders, 1 dispatch
  "tx_snapshot",          // from + to + value + method + status, 1 dispatch
  "address_creator",      // who deployed a contract
  "address_first_tx_funder", // who funded a fresh wallet (de-anon lead)
  "tx_counterparty",      // top counterparties of a wallet
  "contract_name",        // verified protocol name for any address
  "contract_source",      // bounded verified source (head + security lines) for deep reads
  "address_total_txs",    // activity volume → fresh vs established
  "method_label",         // decode a 4-byte selector to a human method name
  "discover",             // find-by-criterion: fresh/trending contracts, top tokens, search
  "resolve",              // name→address: lets users name a target by word, not hex
  "safety",               // one-number risk score for any address
  "classify"              // what TYPE is this contract (works on unverified)
];

export function renderToolsCatalogueFor(intent: string | null): string {
  // Specialized categories ADDED on top of the universal core per intent.
  const cats: Record<string, ToolSpec["category"][]> = {
    audit:   ["contract", "tx", "logs", "identity"],
    profile: ["account", "tx", "identity"],
    trace:   ["tx", "token", "logs", "identity"],
    xray:    ["token", "contract", "identity"],
    watch:   ["account", "contract", "tx"],
    stealth: ["account", "contract", "tx", "identity"],
    free:    ["account", "tx", "contract", "token", "identity", "logs"] // free = widest
  };
  const allow = (intent && cats[intent]) || cats.free;
  const coreSet = new Set(UNIVERSAL_CORE);

  const lines: string[] = [];

  // 1) Universal core first, each with a one-line description.
  lines.push("# CORE (use for ANY question — each is ONE on-chain dispatch):");
  for (const name of UNIVERSAL_CORE) {
    const t = TOOL_BY_NAME[name];
    if (!t) continue;
    const argList = Object.keys(t.args).join(",");
    const desc = t.description.split(/[.!]/)[0].slice(0, 90);
    lines.push(`${t.name}(${argList}) — ${desc}`);
  }

  // 2) Intent-specialized tools (names only, the core already covers basics).
  lines.push("# SPECIALIZED (intent-specific extras):");
  for (const t of TOOLS) {
    if (coreSet.has(t.name)) continue;            // already in core
    if (t.name.startsWith("_")) continue;          // internal/hidden
    if (!allow.includes(t.category)) continue;
    const argList = Object.keys(t.args).join(",");
    lines.push(`${t.name}(${argList})`);
  }
  return lines.join("\n");
}
