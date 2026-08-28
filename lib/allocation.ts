export type Protocol = "morpho" | "moonwell";

export interface AllocationInput {
  morphoApyBps: number;
  moonwellApyBps: number;
  morphoLiquidityRatio: number;
  moonwellLiquidityRatio: number;
  currentAllocation: Protocol | "none" | "split";
  minMoveThresholdBps: number;
  lowLiquidityThreshold: number;
  moonwellDepositsPaused: boolean;
}

export interface AllocationRecommendation {
  recommended: Protocol;
  apyDeltaBps: number;
  shouldMove: boolean;
  lowLiquidityWarning: boolean;
  incidentWarning: boolean;
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
    moonwellDepositsPaused,
  } = input;

  const hasMoonwellExposure = currentAllocation === "moonwell" || currentAllocation === "split";

  // Already holding funds in Moonwell during a paused/incident state — urge
  // withdrawal regardless of the APY math; this overrides the normal comparison.
  if (moonwellDepositsPaused && hasMoonwellExposure) {
    return {
      recommended: "morpho",
      apyDeltaBps: 0,
      shouldMove: true,
      lowLiquidityWarning: false,
      incidentWarning: true,
      reason:
        "Moonwell has an active security incident and deposits are paused — consider withdrawing to Morpho until it's resolved.",
    };
  }

  const rawBest: Protocol = morphoApyBps >= moonwellApyBps ? "morpho" : "moonwell";

  // Moonwell would win on APY but isn't actionable for new deposits right now —
  // fall back to Morpho rather than recommending something the user can't do.
  if (rawBest === "moonwell" && moonwellDepositsPaused) {
    const alreadyInMorpho = currentAllocation === "morpho";
    return {
      recommended: "morpho",
      apyDeltaBps: 0,
      shouldMove: !alreadyInMorpho,
      lowLiquidityWarning: false,
      incidentWarning: true,
      reason: alreadyInMorpho
        ? "Already in Morpho. Moonwell is offering more APY right now, but it has an active security incident and deposits are paused."
        : "Moonwell is offering more APY right now, but it has an active security incident and deposits are paused — recommending Morpho instead.",
    };
  }

  const best = rawBest;
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
    incidentWarning: false,
    reason: alreadyThere
      ? `Already in the higher-yield market (${best}).${liquidityCaveat}`
      : shouldMove
        ? `${best} is offering ${(spreadBps / 100).toFixed(2)}% more APY — worth moving.${liquidityCaveat}`
        : `${best} is slightly higher but under your ${(minMoveThresholdBps / 100).toFixed(2)}% move threshold — staying put avoids gas for a marginal gain.`,
  };
}
