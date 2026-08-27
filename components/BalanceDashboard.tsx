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
  const {
    data: apys,
    isLoading: apysLoading,
    isError: apysError,
    error: apysErrorObj,
    refetch: refetchApys,
  } = useProtocolApys();
  const {
    data: positions,
    isLoading: positionsLoading,
    isError: positionsError,
    error: positionsErrorObj,
    refetch: refetchPositions,
  } = useUserPositions(address);
  const { data: walletUsdc } = useReadContract({
    address: USDC_ADDRESS,
    abi: balanceOfAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 30_000 },
  });

  if (apysError || positionsError) {
    const message = (apysErrorObj ?? positionsErrorObj)?.message ?? "Unknown error";
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        <p className="font-medium">Couldn&apos;t load market data.</p>
        <p className="mt-1 text-xs opacity-80">{message}</p>
        <button
          type="button"
          onClick={() => {
            refetchApys();
            refetchPositions();
          }}
          className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900"
        >
          Retry
        </button>
      </div>
    );
  }

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
