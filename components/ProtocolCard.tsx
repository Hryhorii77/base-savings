"use client";

import { useState } from "react";
import type { ProtocolApy } from "@/lib/protocols/types";
import { PROTOCOL_ADAPTERS } from "@/lib/protocols";
import { formatBps, formatUsdc } from "@/lib/format";
import { getProtocolWarning } from "@/lib/protocolHealth";
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

  const adapter = PROTOCOL_ADAPTERS.find((a) => a.id === apy.protocol);
  const warning = getProtocolWarning(apy);
  const isIncident = warning === "incident";

  if (!adapter) return null;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{apy.label}</h3>
          <a
            href={`https://basescan.org/address/${apy.contractAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-400 hover:text-blue-600 hover:underline dark:hover:text-blue-400"
          >
            View contract ↗
          </a>
        </div>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
          {formatBps(apy.apyBps)} APY
        </span>
      </div>
      {warning === "incident" && (
        <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          ⚠ Active security incident — new deposits are paused. Withdrawals still work.
        </p>
      )}
      {warning === "low-liquidity" && (
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
          disabled={isIncident}
          onClick={() => setModalMode("deposit")}
          className="flex-1 rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
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
          apy={apy}
          mode={modalMode}
          walletUsdcBalance={walletUsdcBalance}
          protocolBalance={balance}
          onClose={() => setModalMode(null)}
        />
      )}
    </div>
  );
}
