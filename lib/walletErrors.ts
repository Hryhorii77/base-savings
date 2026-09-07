export function friendlyError(e: unknown): string {
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
