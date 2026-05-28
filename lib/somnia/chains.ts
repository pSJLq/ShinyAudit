import { defineChain } from "viem";
import { NETWORKS } from "./agents";

export const somniaTestnet = defineChain({
  id: NETWORKS.testnet.chainId,
  name: NETWORKS.testnet.network,
  network: "somnia-testnet",
  nativeCurrency: NETWORKS.testnet.nativeCurrency,
  rpcUrls: {
    default: { http: [NETWORKS.testnet.rpcUrl] },
    public: { http: [NETWORKS.testnet.rpcUrl] }
  },
  blockExplorers: {
    default: { name: "Shannon Explorer", url: NETWORKS.testnet.explorerUrl.replace(/\/$/, "") }
  },
  testnet: true
});

export const somniaMainnet = defineChain({
  id: NETWORKS.mainnet.chainId,
  name: NETWORKS.mainnet.network,
  network: "somnia",
  nativeCurrency: NETWORKS.mainnet.nativeCurrency,
  rpcUrls: {
    default: { http: [NETWORKS.mainnet.rpcUrl] },
    public: { http: [NETWORKS.mainnet.rpcUrl] }
  },
  blockExplorers: {
    default: { name: "Somnia Explorer", url: NETWORKS.mainnet.explorerUrl.replace(/\/$/, "") }
  }
});

export const ACTIVE_NETWORK = NETWORKS.testnet;
export const ACTIVE_CHAIN = somniaTestnet;
export const EXPLORER_URL = ACTIVE_NETWORK.explorerUrl.replace(/\/$/, "");
export const EXPLORER_API = `${EXPLORER_URL}/api`;
export const AGENT_EXPLORER_URL = ACTIVE_NETWORK.agentExplorerUrl;
export const RECEIPTS_BASE_URL = ACTIVE_NETWORK.receiptsBaseUrl;
export const PLATFORM_ADDRESS = ACTIVE_NETWORK.contracts.SomniaAgents;
