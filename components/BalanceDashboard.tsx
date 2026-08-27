"use client";

import { useAccount, useReadContract } from "wagmi";
import { useProtocolApys } from "@/hooks/useProtocolApys";
import { useUserPositions } from "@/hooks/useUserPositions";
import { USDC_ADDRESS } from "@/lib/config";
import { formatUsdc } from "@/lib/format";
import { AllocationBanner } from "./AllocationBanner";
import { ProtocolCard } from "./ProtocolCard";

// wagmi 3.x's useBalance no longer supports an ERC-20 `token` param (native
// balances only) — read USDC's balanceOf directly instead.
const balanceOfAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export function BalanceDashboard() {
  const { address } = useAccount();
  const { data: apys, isLoading: apysLoading } = useProtocolApys();
  const { data: positions, isLoading: positionsLoading } = useUserPositions(address);
  const { data: walletUsdc } = useReadContract({
    address: USDC_ADDRESS,
    abi: balanceOfAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 30_000 },
  });

  if (apysLoading || positionsLoading || !apys || !positions) {
    return <p className="text-sm text-zinc-500">Loading market data…</p>;
  }

  const walletUsdcBalance = walletUsdc ?? 0n;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <div className="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <p className="text-xs text-zinc-500">Wallet USDC balance</p>
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {formatUsdc(walletUsdcBalance)}
        </p>
      </div>

      <AllocationBanner
        morphoApyBps={apys.morpho.apyBps}
        moonwellApyBps={apys.moonwell.apyBps}
        morphoLiquidityRatio={apys.morpho.liquidityRatio}
        moonwellLiquidityRatio={apys.moonwell.liquidityRatio}
        currentAllocation={positions.currentAllocation}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <ProtocolCard
          apy={apys.morpho}
          balance={positions.morphoBalance}
          walletUsdcBalance={walletUsdcBalance}
        />
        <ProtocolCard
          apy={apys.moonwell}
          balance={positions.moonwellBalance}
          walletUsdcBalance={walletUsdcBalance}
        />
      </div>
    </div>
  );
}
