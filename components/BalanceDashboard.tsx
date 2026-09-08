"use client";

import { useAccount, useReadContract } from "wagmi";
import { useProtocolApys } from "@/hooks/useProtocolApys";
import { useUserPositions } from "@/hooks/useUserPositions";
import { USDC_ADDRESS } from "@/lib/config";
import { formatUsdc } from "@/lib/format";
import { sortByHealth } from "@/lib/protocolHealth";
import { AllocationBanner } from "./AllocationBanner";
import { ProtocolCard } from "./ProtocolCard";
import { TransactionHistory } from "./TransactionHistory";

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
    query: { enabled: !!address, refetchInterval: 90_000 },
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

  // Simple point-in-time projection (current balance × current APY) — not a
  // compounding forecast, just enough to answer "is this doing anything?"
  // without the user doing bps math in their head.
  const totalSaved = apys.reduce(
    (sum, apy) => sum + (positions.balances[apy.protocol] ?? 0n),
    0n
  );
  const yearlyEarnings = apys.reduce((sum, apy) => {
    const balance = positions.balances[apy.protocol] ?? 0n;
    return sum + (balance * BigInt(apy.apyBps)) / 10_000n;
  }, 0n);
  const monthlyEarnings = yearlyEarnings / 12n;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <p className="text-xs text-zinc-500">Total saved</p>
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {formatUsdc(totalSaved)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <p className="text-xs text-zinc-500">Est. monthly earnings</p>
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            +{formatUsdc(monthlyEarnings)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <p className="text-xs text-zinc-500">Est. yearly earnings</p>
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            +{formatUsdc(yearlyEarnings)}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <p className="text-xs text-zinc-500">Wallet USDC balance</p>
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {formatUsdc(walletUsdcBalance)}
        </p>
      </div>

      <AllocationBanner
        apys={apys}
        heldProtocols={positions.heldProtocols}
        balances={positions.balances}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {sortByHealth(apys).map((apy) => (
          <ProtocolCard
            key={apy.protocol}
            apy={apy}
            balance={positions.balances[apy.protocol] ?? 0n}
            walletUsdcBalance={walletUsdcBalance}
          />
        ))}
      </div>

      {address && <TransactionHistory address={address} />}
    </div>
  );
}
