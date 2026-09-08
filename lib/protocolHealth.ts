import { LOW_LIQUIDITY_THRESHOLD, PROTOCOL_DEPOSITS_ENABLED } from "./config";
import type { ProtocolApy } from "./protocols/types";

export type ProtocolWarning = "incident" | "low-liquidity" | null;

export function getProtocolWarning(apy: ProtocolApy): ProtocolWarning {
  if (!PROTOCOL_DEPOSITS_ENABLED[apy.protocol]) return "incident";
  if (apy.liquidityRatio < LOW_LIQUIDITY_THRESHOLD) return "low-liquidity";
  return null;
}

// Healthy (no warning) markets first, so a red-flagged card isn't competing
// with a perfectly usable one for the top-left slot — the warned ones stay
// fully visible, just not first. Array.prototype.sort is stable (ES2019+),
// so relative order within each group (healthy vs warned) is preserved.
export function sortByHealth(apys: readonly ProtocolApy[]): ProtocolApy[] {
  return [...apys].sort(
    (a, b) => Number(getProtocolWarning(a) !== null) - Number(getProtocolWarning(b) !== null)
  );
}
