"use client";

import { useState } from "react";
import type { ProtocolApy } from "@/lib/protocols/types";
import { moonwellAdapter } from "@/lib/protocols/moonwell";
import { morphoAdapter } from "@/lib/protocols/morpho";
import { LOW_LIQUIDITY_THRESHOLD } from "@/lib/config";
import { formatBps, formatUsdc } from "@/lib/format";
import { DepositWithdrawModal } from "./DepositWithdrawModal";

export function ProtocolCard({
  apy,
  balance,
  walletUsdcBalance,
}: {
  apy: ProtocolApy | undefined;
  balance: bigint;
  walletUsdcBalance: bigint;
}) {
  const [modalMode, setModalMode] = useState<"deposit" | "withdraw" | null>(null);
  if (!apy) return null;

  const adapter = apy.protocol === "morpho" ? morphoAdapter : moonwellAdapter;
  const isLowLiquidity = apy.liquidityRatio < LOW_LIQUIDITY_THRESHOLD;

  return (
    <div className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{apy.label}</h3>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
          {formatBps(apy.apyBps)} APY
        </span>
      </div>
      {isLowLiquidity && (
        <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          ⚠ Low liquidity — only {(apy.liquidityRatio * 100).toFixed(0)}% of supply is
          currently withdrawable
        </p>
      )}
      <p className="mt-3 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {formatUsdc(balance)}
      </p>
      <p className="text-xs text-zinc-500">your position</p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setModalMode("deposit")}
          className="flex-1 rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Deposit
        </button>
        <button
          type="button"
          disabled={balance === 0n}
          onClick={() => setModalMode("withdraw")}
          className="flex-1 rounded-lg border border-zinc-300 py-2 text-sm font-medium text-zinc-700 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200"
        >
          Withdraw
        </button>
      </div>

      {modalMode && (
        <DepositWithdrawModal
          adapter={adapter}
          mode={modalMode}
          walletUsdcBalance={walletUsdcBalance}
          protocolBalance={balance}
          onClose={() => setModalMode(null)}
        />
      )}
    </div>
  );
}
