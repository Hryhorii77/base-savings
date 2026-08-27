import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { baseAccount, injected, walletConnect } from "wagmi/connectors";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export function getConfig() {
  return createConfig({
    chains: [base, baseSepolia],
    // Lets wagmi auto-discover every EIP-6963-compliant injected wallet (MetaMask,
    // Rabby, etc.) as its own connector, each shown separately in the UI. `injected()`
    // below is the generic window.ethereum fallback for wallets that predate EIP-6963.
    multiInjectedProviderDiscovery: true,
    connectors: [
      baseAccount({ appName: "Base Savings" }),
      injected(),
      // Requires a free project ID from https://cloud.reown.com — omitted (rather
      // than passing an invalid one) if unset, so the rest of the app still works.
      ...(walletConnectProjectId
        ? [walletConnect({ projectId: walletConnectProjectId, showQrModal: true })]
        : []),
    ],
    storage: createStorage({ storage: cookieStorage }),
    ssr: true,
    transports: {
      [base.id]: http(),
      [baseSepolia.id]: http(),
    },
  });
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}
