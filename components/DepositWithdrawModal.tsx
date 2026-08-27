"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAccount, useConfig, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { formatUsdc, parseUsdc } from "@/lib/format";
import type { ProtocolAdapter } from "@/lib/protocols/types";

type Mode = "deposit" | "withdraw";

export function DepositWithdrawModal({
  adapter,
  mode,
  walletUsdcBalance,
  protocolBalance,
  onClose,
}: {
  adapter: ProtocolAdapter;
  mode: Mode;
  walletUsdcBalance: bigint;
  protocolBalance: bigint;
  onClose: () => void;
}) {
  const { address } = useAccount();
  const config = useConfig();
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();

  const [amountInput, setAmountInput] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const maxAmount = mode === "deposit" ? walletUsdcBalance : protocolBalance;
  const amount = parseUsdc(amountInput);
  const isValid = amount > 0n && amount <= maxAmount;

  async function handleSubmit() {
    if (!address || !isValid) return;
    setStatus("pending");
    setError(null);
    try {
      const txs =
        mode === "deposit"
          ? await adapter.buildDepositTx(address, amount)
          : await adapter.buildWithdrawTx(address, amount);

      for (const tx of txs) {
        const hash = await writeContractAsync({
          address: tx.address,
          abi: tx.abi,
          functionName: tx.functionName,
          args: tx.args,
        });
        await waitForTransactionReceipt(config, { hash });
      }

      await queryClient.invalidateQueries({ queryKey: ["user-positions"] });
      onClose();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Transaction failed");
      return;
    }
    setStatus("idle");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="text-lg font-semibold capitalize text-zinc-900 dark:text-zinc-50">
          {mode} — {adapter.id}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Available: {formatUsdc(maxAmount)} USDC
        </p>

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
            className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {status === "pending" ? "Confirming…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
