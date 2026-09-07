"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAccount, useConfig, useSwitchChain, useWriteContract } from "wagmi";
import { getCapabilities, sendCalls, waitForCallsStatus, waitForTransactionReceipt } from "wagmi/actions";
import { BASE_CHAIN_ID } from "@/lib/config";
import { formatUsdc } from "@/lib/format";
import { toSendCalls } from "@/lib/rebalanceCalls";
import type { ProtocolAdapter, TxRequest } from "@/lib/protocols/types";
import { recordTx } from "@/lib/txHistory";
import { friendlyError } from "@/lib/walletErrors";

export function RebalanceModal({
  sourceAdapter,
  targetAdapter,
  sourceLabel,
  targetLabel,
  amount,
  onClose,
}: {
  sourceAdapter: ProtocolAdapter;
  targetAdapter: ProtocolAdapter;
  sourceLabel: string;
  targetLabel: string;
  amount: bigint;
  onClose: () => void;
}) {
  const { address, chainId } = useAccount();
  const config = useConfig();
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();

  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Sequential fallback for wallets without EIP-5792 batch support — signs
  // each call in order and returns the final tx hash (the last call in a
  // deposit/withdraw list is always the real action; earlier ones are approvals).
  async function signSequentially(txs: TxRequest[]): Promise<`0x${string}` | undefined> {
    let lastHash: `0x${string}` | undefined;
    for (const tx of txs) {
      const hash = await writeContractAsync({
        address: tx.address,
        abi: tx.abi,
        functionName: tx.functionName,
        args: tx.args,
      });
      await waitForTransactionReceipt(config, { hash, chainId: BASE_CHAIN_ID });
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

      // Only attempt the batched (EIP-5792) path if the connected wallet has
      // already told us it supports atomic batches — most injected wallets
      // don't implement `wallet_getCapabilities` at all and simply error out,
      // which we treat the same as "unsupported" and fall back silently.
      // Once we've committed to the batched path, any further error
      // (including the user rejecting the single batched signature) is a
      // real failure and surfaces normally — it must not silently retry as
      // two separate sequential signatures behind the user's back.
      let atomicSupported = false;
      try {
        // Passing chainId returns the capabilities record for that chain
        // directly (not keyed by chain), per wagmi/viem's getCapabilities contract.
        const caps = await getCapabilities(config, { account: address, chainId: BASE_CHAIN_ID });
        const atomicStatus = caps?.atomic?.status;
        atomicSupported = atomicStatus === "supported" || atomicStatus === "ready";
      } catch {
        atomicSupported = false;
      }

      if (atomicSupported) {
        const { id } = await sendCalls(config, {
          account: address,
          chainId: BASE_CHAIN_ID,
          calls: toSendCalls([...withdrawTxs, ...depositTxs]),
        });
        const result = await waitForCallsStatus(config, { id, throwOnFailure: true });

        const withdrawHash = result.receipts?.[0]?.transactionHash ?? (id as `0x${string}`);
        const depositHash =
          result.receipts?.[result.receipts.length - 1]?.transactionHash ?? (id as `0x${string}`);
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
      } else {
        const withdrawHash = await signSequentially(withdrawTxs);
        if (withdrawHash) {
          recordTx(address, {
            hash: withdrawHash,
            protocol: sourceAdapter.id,
            mode: "withdraw",
            amount: amount.toString(),
            timestamp: Date.now(),
          });
        }
        const depositHash = await signSequentially(depositTxs);
        if (depositHash) {
          recordTx(address, {
            hash: depositHash,
            protocol: targetAdapter.id,
            mode: "deposit",
            amount: amount.toString(),
            timestamp: Date.now(),
          });
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["user-positions"] });
      onClose();
    } catch (e) {
      setStatus("error");
      setError(friendlyError(e));
      return;
    }
    setStatus("idle");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
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
