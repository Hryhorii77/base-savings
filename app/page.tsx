"use client";

import { useAccount } from "wagmi";
import { BalanceDashboard } from "@/components/BalanceDashboard";
import { NetworkGuard } from "@/components/NetworkGuard";
import { WalletConnectButton } from "@/components/WalletConnectButton";

export default function Home() {
  const { isConnected } = useAccount();

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Base Savings
        </h1>
        <WalletConnectButton />
      </div>

      <p className="mt-2 w-full max-w-2xl text-sm text-zinc-500">
        Non-custodial USDC savings on Base. Deposit into whichever lending market is
        paying more — every transaction is signed by you.
      </p>

      <div className="mt-10 w-full max-w-2xl">
        {isConnected ? (
          <NetworkGuard>
            <BalanceDashboard />
          </NetworkGuard>
        ) : (
          <p className="text-sm text-zinc-500">Connect your wallet to get started.</p>
        )}
      </div>
    </div>
  );
}
