const USDC_DECIMALS = 6;

export function formatUsdc(amount: bigint): string {
  const whole = amount / 10n ** BigInt(USDC_DECIMALS);
  const frac = amount % 10n ** BigInt(USDC_DECIMALS);
  const fracStr = frac.toString().padStart(USDC_DECIMALS, "0").slice(0, 2);
  return `$${whole.toLocaleString()}.${fracStr}`;
}

export function parseUsdc(input: string): bigint {
  const trimmed = input.trim();
  if (!trimmed || Number.isNaN(Number(trimmed))) return 0n;
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = (frac + "0".repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  return BigInt(whole || "0") * 10n ** BigInt(USDC_DECIMALS) + BigInt(fracPadded || "0");
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

// A real transaction hash is exactly 32 bytes. EIP-5792's wallet_sendCalls
// returns an opaque batch id instead — not a transaction hash, and not
// guaranteed to even be the right length — that some wallets don't resolve
// to a real per-call hash via wallet_getCallsStatus's receipts field
// (observed live with Coinbase Smart Wallet: receipts came back empty).
// Basescan (correctly) rejects anything that isn't a real hash, so this
// guards every "View transaction" link from ever pointing at a batch id.
export function isValidTxHash(hash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(hash);
}
