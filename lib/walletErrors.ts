import type { Config } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";

// Thrown when a transaction is mined but its call reverted — most visible
// with smart-contract wallets (Coinbase Smart Wallet, Base Account), where
// the outer bundler transaction can succeed (status: success, gas paid)
// while the inner call it carried reverted. viem's waitForTransactionReceipt
// returns this distinction as receipt.status but does not throw on it —
// callers must check explicitly, which is what this error represents.
export class TransactionRevertedError extends Error {
  constructor(hash: string) {
    super(`Transaction reverted on-chain (${hash}) — no funds were moved.`);
    this.name = "TransactionRevertedError";
  }
}

// Wraps waitForTransactionReceipt with the success check it doesn't do
// itself — observed live: a withdrawal's outer transaction reported
// status: success (the bundler was paid) while the inner call actually
// reverted and moved zero funds, and this app recorded it as a completed
// withdrawal anyway because nothing ever looked at receipt.status.
export async function waitForSuccessfulReceipt(
  config: Config,
  params: { hash: `0x${string}`; chainId: number }
) {
  const receipt = await waitForTransactionReceipt(config, params);
  if (receipt.status === "reverted") {
    throw new TransactionRevertedError(params.hash);
  }
  return receipt;
}

export function friendlyError(e: unknown): string {
  if (e instanceof TransactionRevertedError) {
    return "That transaction reverted on-chain — nothing moved. Your balance may have changed since this dialog opened; refresh and try again.";
  }
  if (!(e instanceof Error)) return "Transaction failed.";
  const name = (e as { name?: string }).name;
  if (name === "UserRejectedRequestError" || /user rejected/i.test(e.message)) {
    return "Cancelled — nothing was signed.";
  }
  if (name === "ChainMismatchError" || /does not match the target chain/i.test(e.message)) {
    return "Wrong network — please switch your wallet to Base and try again.";
  }
  if (/archive requests require/i.test(e.message)) {
    // Observed live: some wallets (e.g. Rabby) run their own pre-sign
    // simulation against their own configured Base RPC, independent of this
    // app's — and can hit a paid-tier archive-node limit on that provider.
    // Nothing on our end can fix another provider's rate limit; the fastest
    // path is a different wallet or a different RPC in that wallet's settings.
    return "Your wallet's own network provider rejected this request (it needs a paid archive-node plan). Try a different wallet, or change the Base RPC endpoint in your wallet's settings.";
  }
  // viem errors often dump multi-line contract-call details; keep just the summary.
  return e.message.split("\n")[0];
}
