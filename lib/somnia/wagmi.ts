import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { somniaTestnet, somniaMainnet } from "./chains";

export const wagmiConfig = createConfig({
  chains: [somniaTestnet, somniaMainnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [somniaTestnet.id]: http(),
    [somniaMainnet.id]: http()
  },
  ssr: true
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
