import type { ProtocolId } from "./protocols/types";

export interface ProtocolSnapshot {
  protocol: ProtocolId;
  apyBps: number;
  liquidityRatio: number;
  depositsEnabled: boolean;
}

export interface AllocationInput {
  protocols: ProtocolSnapshot[];
  /** Protocols where the user currently has a nonzero balance. */
  heldProtocols: ProtocolId[];
  minMoveThresholdBps: number;
  lowLiquidityThreshold: number;
}

export interface AllocationRecommendation {
  recommended: ProtocolId;
  apyDeltaBps: number;
  shouldMove: boolean;
  lowLiquidityWarning: boolean;
  incidentWarning: boolean;
  reason: string;
}

function pickBest(protocols: ProtocolSnapshot[]): ProtocolSnapshot {
  return protocols.reduce((best, p) => (p.apyBps > best.apyBps ? p : best));
}

export function recommend(input: AllocationInput): AllocationRecommendation {
  const { protocols, heldProtocols, minMoveThresholdBps, lowLiquidityThreshold } = input;

  const enabled = protocols.filter((p) => p.depositsEnabled);
  const enabledIds = new Set(enabled.map((p) => p.protocol));
  const heldDisabled = heldProtocols.filter((id) => !enabledIds.has(id));
  const bestEnabled = pickBest(enabled.length > 0 ? enabled : protocols);

  // Urgent: holding funds in a protocol whose deposits are now disabled (e.g.
  // an active security incident) — urge withdrawal regardless of the APY math.
  // This overrides every other branch below.
  if (heldDisabled.length > 0) {
    return {
      recommended: bestEnabled.protocol,
      apyDeltaBps: 0,
      shouldMove: true,
      lowLiquidityWarning: false,
      incidentWarning: true,
      reason: `${heldDisabled.join(", ")} has an active security incident and deposits are paused — consider withdrawing to ${bestEnabled.protocol}.`,
    };
  }

  const globalBest = pickBest(protocols);
  const globalBestIsDisabled = !enabledIds.has(globalBest.protocol);
  const alreadyThere = heldProtocols.length === 1 && heldProtocols[0] === bestEnabled.protocol;

  // The highest-APY protocol overall isn't actionable for new deposits right
  // now — fall back to the best enabled one rather than recommending
  // something the user can't do.
  if (globalBestIsDisabled) {
    return {
      recommended: bestEnabled.protocol,
      apyDeltaBps: 0,
      shouldMove: !alreadyThere,
      lowLiquidityWarning: false,
      incidentWarning: true,
      reason: alreadyThere
        ? `Already in ${bestEnabled.protocol}. ${globalBest.protocol} is offering more APY right now, but it has an active security incident and deposits are paused.`
        : `${globalBest.protocol} is offering more APY right now, but it has an active security incident and deposits are paused — recommending ${bestEnabled.protocol} instead.`,
    };
  }

  const lowLiquidityWarning = bestEnabled.liquidityRatio < lowLiquidityThreshold;

  // Baseline to compare the recommendation against: the currently-held
  // protocol's own APY if exactly one is held; otherwise (holding none, or
  // split across several) the runner-up enabled protocol's APY, mirroring the
  // original two-protocol behavior of comparing whichever two are on offer.
  let baselineApyBps: number;
  if (heldProtocols.length === 1) {
    baselineApyBps = protocols.find((p) => p.protocol === heldProtocols[0])?.apyBps ?? 0;
  } else {
    const runnerUp = [...enabled].sort((a, b) => b.apyBps - a.apyBps)[1];
    baselineApyBps = runnerUp?.apyBps ?? 0;
  }

  const spreadBps = Math.max(0, bestEnabled.apyBps - baselineApyBps);
  const shouldMove = !alreadyThere && spreadBps >= minMoveThresholdBps;

  const liquidityCaveat = lowLiquidityWarning
    ? ` Heads up: ${bestEnabled.protocol}'s available liquidity is currently thin (${(bestEnabled.liquidityRatio * 100).toFixed(0)}% of supply withdrawable) — large withdrawals may be constrained.`
    : "";

  return {
    recommended: bestEnabled.protocol,
    apyDeltaBps: shouldMove ? spreadBps : 0,
    shouldMove,
    lowLiquidityWarning,
    incidentWarning: false,
    reason: alreadyThere
      ? `Already in the higher-yield market (${bestEnabled.protocol}).${liquidityCaveat}`
      : shouldMove
        ? `${bestEnabled.protocol} is offering ${(spreadBps / 100).toFixed(2)}% more APY — worth moving.${liquidityCaveat}`
        : `${bestEnabled.protocol} is slightly higher but under your ${(minMoveThresholdBps / 100).toFixed(2)}% move threshold — staying put avoids gas for a marginal gain.`,
  };
}
