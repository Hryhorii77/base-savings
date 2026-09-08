"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAccount, useConfig, useSwitchChain, useWriteContract } from "wagmi";
import { BASE_CHAIN_ID } from "@/lib/config";
import { trySendCallsBatch } from "@/lib/eip5792Batch";
import { formatBps, formatUsdc, isValidTxHash, parseUsdc } from "@/lib/format";
import type { ProtocolAdapter, ProtocolApy } from "@/lib/protocols/types";
import { refreshPositionsAfterTx } from "@/lib/refreshPositions";
import { recordTx } from "@/lib/txHistory";
import { friendlyError, waitForSuccessfulReceipt } from "@/lib/walletErrors";

type Mode = "deposit" | "withdraw";

// Unset unless a Paymaster & Bundler URL (e.g. from Coinbase Developer
// Platform) is configured — omitted entirely rather than passed empty, same
// pattern as NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in app/wagmi.ts. Any actual
// spending policy (first-deposit-only, per-address caps, etc.) is enforced by
// the paymaster provider itself, not by this app.
const PAYMASTER_URL = process.env.NEXT_PUBLIC_PAYMASTER_URL;

export function DepositWithdrawModal({
  adapter,
  apy,
  mode,
  walletUsdcBalance,
  protocolBalance,
  onClose,
}: {
  adapter: ProtocolAdapter;
  apy: ProtocolApy;
  mode: Mode;
  walletUsdcBalance: bigint;
  protocolBalance: bigint;
  onClose: () => void;
}) {
  const { address, chainId } = useAccount();
  const config = useConfig();
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();

  const [amountInput, setAmountInput] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "error" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const [receiptHash, setReceiptHash] = useState<string | null>(null);
  const [receiptAmount, setReceiptAmount] = useState<bigint | null>(null);

  const maxAmount = mode === "deposit" ? walletUsdcBalance : protocolBalance;
  const amount = parseUsdc(amountInput);
  const isValid = amount > 0n && amount <= maxAmount;

  async function handleSubmit() {
    if (!address || !isValid) return;
    setStatus("pending");
    setError(null);
    try {
      // Proactively prompt a network switch in the wallet up front, rather
      // than letting a chain-mismatch surface as a raw error from the write
      // call. NetworkGuard normally prevents reaching this modal on the
      // wrong chain at all, but the wallet can switch networks in the
      // background after that check ran (observed live) — this catches it
      // right when the user acts instead of after a failed signature.
      if (chainId !== BASE_CHAIN_ID) {
        await switchChainAsync({ chainId: BASE_CHAIN_ID });
      }

      const txs =
        mode === "deposit"
          ? await adapter.buildDepositTx(address, amount)
          : await adapter.buildWithdrawTx(address, amount);

      // A deposit is [approve, deposit] — batching it via EIP-5792 collapses
      // that into one signature, and lets a paymaster-capable wallet sponsor
      // the gas. A withdrawal is already a single call, so there's nothing to
      // batch and this path is skipped for it.
      const batch =
        mode === "deposit" ? await trySendCallsBatch(config, BASE_CHAIN_ID, address, txs, PAYMASTER_URL) : null;

      // The last tx in the list is always the actual deposit/withdraw call
      // (deposits are [approve, deposit]; withdrawals are just [withdraw]) —
      // that's the one worth showing in the user's activity feed, not the
      // approve step.
      let actionHash: `0x${string}` | undefined = batch?.hashes[batch.hashes.length - 1];

      if (!batch) {
        for (const tx of txs) {
          // No explicit chainId here — the upfront switchChainAsync above is
          // the enforcement point. Passing chainId directly into writeContract
          // as well caused a real failure ("Invalid parameters were provided
          // to the RPC method") even when the wallet was already on Base,
          // likely from wagmi bundling a redundant chain-switch handshake into
          // the write call itself that the wallet didn't handle gracefully.
          const hash = await writeContractAsync({
            address: tx.address,
            abi: tx.abi,
            functionName: tx.functionName,
            args: tx.args,
          });
          await waitForSuccessfulReceipt(config, { hash, chainId: BASE_CHAIN_ID, account: address });
          actionHash = hash;
        }
      }

      if (actionHash) {
        recordTx(address, {
          hash: actionHash,
          protocol: adapter.id,
          mode,
          amount: amount.toString(),
          timestamp: Date.now(),
        });
      }

      await refreshPositionsAfterTx(queryClient);
      setReceiptHash(actionHash ?? null);
      setReceiptAmount(amount);
      setStatus("success");
      return;
    } catch (e) {
      setStatus("error");
      setError(friendlyError(e));
      return;
    }
  }

  if (status === "success") {
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
            {mode === "deposit" ? "Deposit complete" : "Withdrawal complete"}
          </h2>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
            {mode === "deposit" ? (
              <>
                You now earn <span className="font-semibold">~{formatBps(apy.apyBps)}</span> APY
                on <span className="font-medium">{apy.label}</span>. Withdraw anytime.
              </>
            ) : (
              <>
                Withdrew {receiptAmount !== null ? formatUsdc(receiptAmount) : ""} from{" "}
                <span className="font-medium">{apy.label}</span> back to your wallet.
              </>
            )}
          </p>
          {receiptHash && isValidTxHash(receiptHash) && (
            <a
              href={`https://basescan.org/tx/${receiptHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              View transaction ↗
            </a>
          )}
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
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold capitalize text-zinc-900 dark:text-zinc-50">
          {mode} — {apy.label}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Available: {formatUsdc(maxAmount)} USDC
        </p>
        {mode === "deposit" && PAYMASTER_URL && (
          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
            Gas may be sponsored for this deposit if your wallet supports it.
          </p>
        )}

        <div className="mt-4">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-lg outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
          <button
            type="button"
            onClick={() => setAmountInput(formatUsdc(maxAmount).replace("$", ""))}
            className="mt-1 text-xs text-blue-600 hover:underline"
          >
            Use max
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-300 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isValid || status === "pending"}
            onClick={handleSubmit}
            className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
          >
            {status === "pending" ? "Confirming…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
