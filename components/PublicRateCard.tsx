import { formatBps } from "@/lib/format";
import { getProtocolWarning } from "@/lib/protocolHealth";
import type { ProtocolApy } from "@/lib/protocols/types";

export function PublicRateCard({ apy }: { apy: ProtocolApy }) {
  const warning = getProtocolWarning(apy);

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
          ⚠ Active security incident — new deposits are paused.
        </p>
      )}
      {warning === "low-liquidity" && (
        <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          ⚠ Low liquidity — only {(apy.liquidityRatio * 100).toFixed(0)}% of supply is
          currently withdrawable
        </p>
      )}
    </div>
  );
}
