"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Address } from "viem";
import { useAccount, useConfig, useSwitchChain, useWriteContract } from "wagmi";
import { BASE_CHAIN_ID } from "@/lib/config";
import { trySendCallsBatch } from "@/lib/eip5792Batch";
import { formatBps, formatUsdc, isValidTxHash } from "@/lib/format";
import type { ProtocolAdapter, TxRequest } from "@/lib/protocols/types";
import { refreshPositionsAfterTx } from "@/lib/refreshPositions";
import { recordTx } from "@/lib/txHistory";
import { friendlyError, waitForSuccessfulReceipt } from "@/lib/walletErrors";

export function RebalanceModal({
  sourceAdapter,
  targetAdapter,
  sourceLabel,
  targetLabel,
  targetApyBps,
  amount,
  onClose,
}: {
  sourceAdapter: ProtocolAdapter;
  targetAdapter: ProtocolAdapter;
  sourceLabel: string;
  targetLabel: string;
  targetApyBps: number;
  amount: bigint;
  onClose: () => void;
}) {
  const { address, chainId } = useAccount();
  const config = useConfig();
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();

  const [status, setStatus] = useState<"idle" | "pending" | "error" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ withdrawHash: string; depositHash: string } | null>(
    null
  );

  // Sequential fallback for wallets without EIP-5792 batch support — signs
  // each call in order and returns the final tx hash (the last call in a
  // deposit/withdraw list is always the real action; earlier ones are approvals).
  async function signSequentially(
    txs: TxRequest[],
    account: Address
  ): Promise<`0x${string}` | undefined> {
    let lastHash: `0x${string}` | undefined;
    for (const tx of txs) {
      const hash = await writeContractAsync({
        address: tx.address,
        abi: tx.abi,
        functionName: tx.functionName,
        args: tx.args,
      });
      await waitForSuccessfulReceipt(config, { hash, chainId: BASE_CHAIN_ID, account });
      lastHash = hash;
    }
    return lastHash;
  }

  async function handleConfirm() {
    if (!address) return;
    setStatus("pending");
    setError(null);
    try {
      if (chainId !== BASE_CHAIN_ID) {
        await switchChainAsync({ chainId: BASE_CHAIN_ID });
      }

      const withdrawTxs = await sourceAdapter.buildWithdrawTx(address, amount);
      const depositTxs = await targetAdapter.buildDepositTx(address, amount);

      let withdrawHash: `0x${string}`;
      let depositHash: `0x${string}`;

      const batch = await trySendCallsBatch(config, BASE_CHAIN_ID, address, [
        ...withdrawTxs,
        ...depositTxs,
      ]);

      if (batch) {
        withdrawHash = batch.hashes[withdrawTxs.length - 1];
        depositHash = batch.hashes[batch.hashes.length - 1];
      } else {
        const seqWithdrawHash = await signSequentially(withdrawTxs, address);
        const seqDepositHash = await signSequentially(depositTxs, address);
        // Every adapter's buildWithdrawTx/buildDepositTx returns at least one
        // call, so signSequentially always resolves a hash here in practice —
        // guard explicitly anyway rather than assuming it away.
        if (!seqWithdrawHash || !seqDepositHash) {
          throw new Error("Rebalance failed: no transaction hash was returned.");
        }
        withdrawHash = seqWithdrawHash;
        depositHash = seqDepositHash;
      }

      recordTx(address, {
        hash: withdrawHash,
        protocol: sourceAdapter.id,
        mode: "withdraw",
        amount: amount.toString(),
        timestamp: Date.now(),
      });
      recordTx(address, {
        hash: depositHash,
        protocol: targetAdapter.id,
        mode: "deposit",
        amount: amount.toString(),
        timestamp: Date.now(),
      });

      await refreshPositionsAfterTx(queryClient);
      setReceipt({ withdrawHash, depositHash });
      setStatus("success");
      return;
    } catch (e) {
      setStatus("error");
      setError(friendlyError(e));
      return;
    }
  }

  if (status === "success" && receipt) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            Rebalance complete
          </h2>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
            Moved {formatUsdc(amount)} from <span className="font-medium">{sourceLabel}</span> to{" "}
            <span className="font-medium">{targetLabel}</span>. You now earn{" "}
            <span className="font-semibold">~{formatBps(targetApyBps)}</span> APY. Withdraw anytime.
          </p>
          <div className="mt-3 flex gap-4 text-xs">
            {isValidTxHash(receipt.withdrawHash) && (
              <a
                href={`https://basescan.org/tx/${receipt.withdrawHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                Withdraw tx ↗
              </a>
            )}
            {isValidTxHash(receipt.depositHash) && (
              <a
                href={`https://basescan.org/tx/${receipt.depositHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                Deposit tx ↗
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full rounded-lg bg-brand py-2 text-sm font-semibold text-white transition-colors hover:bg-brand/90"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={status === "pending" ? undefined : onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Rebalance</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Move <span className="font-semibold">{formatUsdc(amount)}</span> from{" "}
          <span className="font-medium">{sourceLabel}</span> to{" "}
          <span className="font-medium">{targetLabel}</span>.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          One click here signs the withdrawal and the deposit together — as a single
          batched confirmation if your wallet supports it, or two signatures in a row
          if it doesn&apos;t.
        </p>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={status === "pending"}
            className="flex-1 rounded-lg border border-zinc-300 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={status === "pending"}
            onClick={handleConfirm}
            className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
          >
            {status === "pending" ? "Confirming…" : "Confirm rebalance"}
          </button>
        </div>
      </div>
    </div>
  );
}
