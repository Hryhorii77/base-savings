"use client";

import { useState } from "react";
import { recommend } from "@/lib/allocation";
import { LOW_LIQUIDITY_THRESHOLD, MIN_MOVE_THRESHOLD_BPS, PROTOCOL_DEPOSITS_ENABLED } from "@/lib/config";
import { PROTOCOL_ADAPTERS } from "@/lib/protocols";
import type { ProtocolApy, ProtocolId } from "@/lib/protocols/types";
import { RebalanceModal } from "./RebalanceModal";

export function AllocationBanner({
  apys,
  heldProtocols,
  balances,
}: {
  apys: ProtocolApy[];
  heldProtocols: ProtocolId[];
  balances: Partial<Record<ProtocolId, bigint>>;
}) {
  const [rebalanceOpen, setRebalanceOpen] = useState(false);

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

  // A one-click rebalance only makes sense when there's exactly one held
  // protocol to move *from* — holding none, or holding several at once,
  // leaves no unambiguous source to withdraw from.
  const sourceId = heldProtocols.length === 1 ? heldProtocols[0] : undefined;
  const sourceAdapter = sourceId ? PROTOCOL_ADAPTERS.find((a) => a.id === sourceId) : undefined;
  const targetAdapter = PROTOCOL_ADAPTERS.find((a) => a.id === result.recommended);
  const sourceAmount = sourceId ? (balances[sourceId] ?? 0n) : 0n;
  const canRebalance = Boolean(sourceAdapter && targetAdapter && sourceAmount > 0n);

  return (
    <div className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ${bannerColor}`}>
      <span>{result.reason}</span>
      {canRebalance && (
        <button
          type="button"
          onClick={() => setRebalanceOpen(true)}
          className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand/90"
        >
          Rebalance now
        </button>
      )}

      {rebalanceOpen && sourceAdapter && targetAdapter && (
        <RebalanceModal
          sourceAdapter={sourceAdapter}
          targetAdapter={targetAdapter}
          sourceLabel={apys.find((a) => a.protocol === sourceAdapter.id)?.label ?? sourceAdapter.id}
          targetLabel={apys.find((a) => a.protocol === targetAdapter.id)?.label ?? targetAdapter.id}
          targetApyBps={apys.find((a) => a.protocol === targetAdapter.id)?.apyBps ?? 0}
          amount={sourceAmount}
          onClose={() => setRebalanceOpen(false)}
        />
      )}
    </div>
  );
}
