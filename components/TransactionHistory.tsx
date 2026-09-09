"use client";

import { useTxHistory } from "@/hooks/useTxHistory";
import { formatUsdc, isValidTxHash } from "@/lib/format";

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function TransactionHistory({ address }: { address: string }) {
  const history = useTxHistory(address);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">Recent activity</h3>
        <a
          href={`https://basescan.org/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:underline dark:text-blue-400"
        >
          Full history on Basescan ↗
        </a>
      </div>

      {history.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">
          Deposits and withdrawals made through this app will show up here.
        </p>
      ) : (
        <ul className="scroll-thin mt-3 max-h-[420px] divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
          {history.map((tx) => (
            <li key={tx.hash} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <span className="font-medium capitalize text-zinc-900 dark:text-zinc-50">
                  {tx.mode}
                </span>
                <span className="text-zinc-500"> · {tx.protocol}</span>
                <p className="text-xs text-zinc-500">{relativeTime(tx.timestamp)}</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {formatUsdc(BigInt(tx.amount))}
                </p>
                {isValidTxHash(tx.hash) ? (
                  <a
                    href={`https://basescan.org/tx/${tx.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                  >
                    View tx ↗
                  </a>
                ) : (
                  // Some wallets' EIP-5792 batches don't resolve to a real
                  // per-call transaction hash (see lib/format.ts's
                  // isValidTxHash) — no link is better than a broken one.
                  <p className="text-xs text-zinc-400">Hash unavailable</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
