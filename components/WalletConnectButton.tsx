"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, variables } = useConnect();
  const { disconnect } = useDisconnect();
  const [menuOpen, setMenuOpen] = useState(false);

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          {shortenAddress(address)}
        </span>
        <button
          type="button"
          onClick={() => disconnect()}
          className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          Disconnect
        </button>
      </div>
    );
  }

  // Deduped by wagmi: static connectors (Base Account, generic injected,
  // WalletConnect) plus one per EIP-6963-announced extension (MetaMask, Rabby, …).
  const uniqueConnectors = connectors.filter(
    (c, i) => connectors.findIndex((other) => other.id === c.id) === i
  );

  return (
    <div className="relative">
      <button
        type="button"
        disabled={isPending || uniqueConnectors.length === 0}
        onClick={() => setMenuOpen((open) => !open)}
        className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? "Connecting…" : "Connect Wallet"}
      </button>

      {menuOpen && !isPending && (
        <div className="absolute right-0 z-10 mt-2 w-56 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          {uniqueConnectors.map((connector) => (
            <button
              key={connector.id}
              type="button"
              onClick={() => {
                setMenuOpen(false);
                connect({ connector });
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {connector.icon && (
                // eslint-disable-next-line @next/next/no-img-element -- data: URI supplied by the wallet connector, not a static asset
                <img src={connector.icon} alt="" className="h-5 w-5 rounded" />
              )}
              {connector.name}
            </button>
          ))}
        </div>
      )}

      {isPending && variables?.connector && (
        <p className="absolute right-0 mt-2 w-56 text-right text-xs text-zinc-500">
          Approve in {variables.connector.name}…
        </p>
      )}
    </div>
  );
}
