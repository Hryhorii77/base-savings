export type Protocol = "morpho" | "moonwell";

export interface AllocationInput {
  morphoApyBps: number;
  moonwellApyBps: number;
  morphoLiquidityRatio: number;
  moonwellLiquidityRatio: number;
  currentAllocation: Protocol | "none" | "split";
  minMoveThresholdBps: number;
  lowLiquidityThreshold: number;
}

export interface AllocationRecommendation {
  recommended: Protocol;
  apyDeltaBps: number;
  shouldMove: boolean;
  lowLiquidityWarning: boolean;
  reason: string;
}

export function recommend(input: AllocationInput): AllocationRecommendation {
  const {
    morphoApyBps,
    moonwellApyBps,
    morphoLiquidityRatio,
    moonwellLiquidityRatio,
    currentAllocation,
    minMoveThresholdBps,
    lowLiquidityThreshold,
  } = input;

  const best: Protocol = morphoApyBps >= moonwellApyBps ? "morpho" : "moonwell";
  const bestLiquidityRatio = best === "morpho" ? morphoLiquidityRatio : moonwellLiquidityRatio;
  const lowLiquidityWarning = bestLiquidityRatio < lowLiquidityThreshold;

  const spreadBps =
    Math.max(morphoApyBps, moonwellApyBps) - Math.min(morphoApyBps, moonwellApyBps);
  const alreadyThere = currentAllocation === best;
  const shouldMove = !alreadyThere && spreadBps >= minMoveThresholdBps;

  const liquidityCaveat = lowLiquidityWarning
    ? ` Heads up: ${best}'s available liquidity is currently thin (${(bestLiquidityRatio * 100).toFixed(0)}% of supply withdrawable) — large withdrawals may be constrained.`
    : "";

  return {
    recommended: best,
    apyDeltaBps: shouldMove ? spreadBps : 0,
    shouldMove,
    lowLiquidityWarning,
    reason: alreadyThere
      ? `Already in the higher-yield market (${best}).${liquidityCaveat}`
      : shouldMove
        ? `${best} is offering ${(spreadBps / 100).toFixed(2)}% more APY — worth moving.${liquidityCaveat}`
        : `${best} is slightly higher but under your ${(minMoveThresholdBps / 100).toFixed(2)}% move threshold — staying put avoids gas for a marginal gain.`,
  };
}
