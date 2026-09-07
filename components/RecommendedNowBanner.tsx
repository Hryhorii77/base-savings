import { recommend } from "@/lib/allocation";
import { LOW_LIQUIDITY_THRESHOLD, MIN_MOVE_THRESHOLD_BPS, PROTOCOL_DEPOSITS_ENABLED } from "@/lib/config";
import { formatBps } from "@/lib/format";
import type { ProtocolApy } from "@/lib/protocols/types";

// Same recommendation logic as AllocationBanner, but phrased for a visitor
// with no position yet ("recommended now") rather than a holder deciding
// whether to move funds ("worth moving").
export function RecommendedNowBanner({ apys }: { apys: ProtocolApy[] }) {
  const result = recommend({
    protocols: apys.map((apy) => ({
      protocol: apy.protocol,
      apyBps: apy.apyBps,
      liquidityRatio: apy.liquidityRatio,
      depositsEnabled: PROTOCOL_DEPOSITS_ENABLED[apy.protocol],
    })),
    heldProtocols: [],
    minMoveThresholdBps: MIN_MOVE_THRESHOLD_BPS,
    lowLiquidityThreshold: LOW_LIQUIDITY_THRESHOLD,
  });

  const recommended = apys.find((apy) => apy.protocol === result.recommended);
  if (!recommended) return null;

  const isWarning = result.lowLiquidityWarning || result.incidentWarning;
  const bannerColor = isWarning
    ? "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    : "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";

  return (
    <div className={`rounded-xl px-4 py-3 text-sm ${bannerColor}`}>
      <span className="font-medium">
        Recommended now: {recommended.label} at {formatBps(recommended.apyBps)}
      </span>
      {result.lowLiquidityWarning && (
        <span> — heads up, its available liquidity is currently thin.</span>
      )}
    </div>
  );
}
