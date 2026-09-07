"use client";

import { useAccount } from "wagmi";
import { BalanceDashboard } from "@/components/BalanceDashboard";
import { NetworkGuard } from "@/components/NetworkGuard";
import { PublicRateCard } from "@/components/PublicRateCard";
import { RecommendedNowBanner } from "@/components/RecommendedNowBanner";
import { TrustStrip } from "@/components/TrustStrip";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { useProtocolApys } from "@/hooks/useProtocolApys";

function PublicRates() {
  const { data: apys, isLoading, isError } = useProtocolApys();

  if (isLoading || !apys) {
    return <p className="text-sm text-zinc-500">Loading live rates…</p>;
  }
  if (isError) {
    return <p className="text-sm text-zinc-500">Couldn&apos;t load live rates right now.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <RecommendedNowBanner apys={apys} />
      <div className="grid gap-4 sm:grid-cols-2">
        {apys.map((apy) => (
          <PublicRateCard key={apy.protocol} apy={apy} />
        ))}
      </div>
    </div>
  );
}

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

      <div className="mt-10 flex w-full max-w-2xl flex-col gap-6">
        {isConnected ? (
          <NetworkGuard>
            <BalanceDashboard />
          </NetworkGuard>
        ) : (
          <>
            <PublicRates />
            <p className="text-sm text-zinc-500">
              Connect your wallet to deposit, withdraw, or rebalance.
            </p>
          </>
        )}

        <TrustStrip />
      </div>
    </div>
  );
}
