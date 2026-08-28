"use client";

import { recommend } from "@/lib/allocation";
import { LOW_LIQUIDITY_THRESHOLD, MIN_MOVE_THRESHOLD_BPS, PROTOCOL_DEPOSITS_ENABLED } from "@/lib/config";
import type { ProtocolApy, ProtocolId } from "@/lib/protocols/types";

export function AllocationBanner({
  apys,
  heldProtocols,
}: {
  apys: ProtocolApy[];
  heldProtocols: ProtocolId[];
}) {
  const result = recommend({
    protocols: apys.map((apy) => ({
      protocol: apy.protocol,
      apyBps: apy.apyBps,
      liquidityRatio: apy.liquidityRatio,
      depositsEnabled: PROTOCOL_DEPOSITS_ENABLED[apy.protocol],
    })),
    heldProtocols,
    minMoveThresholdBps: MIN_MOVE_THRESHOLD_BPS,
    lowLiquidityThreshold: LOW_LIQUIDITY_THRESHOLD,
  });

  if (!result.shouldMove) {
    return (
      <div className="rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
        {result.reason}
      </div>
    );
  }

  const bannerColor =
    result.incidentWarning || result.lowLiquidityWarning
      ? "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200"
      : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200";

  return (
    <div className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm ${bannerColor}`}>
      <span>{result.reason}</span>
    </div>
  );
}
