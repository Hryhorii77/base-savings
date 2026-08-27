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
