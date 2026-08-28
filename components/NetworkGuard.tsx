"use client";

import type { ReactNode } from "react";
import { useChainId, useSwitchChain } from "wagmi";
import { BASE_CHAIN_ID } from "@/lib/config";

// Blocks access to anything transaction-related while the wallet is on the
// wrong network. Without this, wagmi's writeContract calls silently submit
// to whichever chain the wallet is currently connected to (not necessarily
// Base) unless a chainId is explicitly passed — observed live via a wallet's
// own risk-simulation warning ("recipient is a contract on a different
// chain") before any funds were actually lost. This is the primary guard;
// DepositWithdrawModal also passes chainId explicitly as a second layer.
export function NetworkGuard({ children }: { children: ReactNode }) {
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (chainId === BASE_CHAIN_ID) {
    return <>{children}</>;
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <p className="font-medium">Wrong network</p>
      <p className="mt-1">
        Your wallet is connected to a different network. Base Savings only works on Base —
        switch before depositing or withdrawing.
      </p>
      <button
        type="button"
        onClick={() => switchChain({ chainId: BASE_CHAIN_ID })}
        disabled={isPending}
        className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending ? "Switching…" : "Switch to Base"}
      </button>
    </div>
  );
}
