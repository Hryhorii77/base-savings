import { describe, expect, it } from "vitest";
import { recommend } from "./allocation";

const baseInput = {
  morphoLiquidityRatio: 1,
  moonwellLiquidityRatio: 1,
  minMoveThresholdBps: 25,
  lowLiquidityThreshold: 0.15,
};

describe("recommend", () => {
  it("does not recommend a move when APYs are equal", () => {
    const result = recommend({
      ...baseInput,
      morphoApyBps: 400,
      moonwellApyBps: 400,
      currentAllocation: "none",
    });
    expect(result.shouldMove).toBe(false);
    expect(result.apyDeltaBps).toBe(0);
  });

  it("recommends a move when the spread exactly equals the threshold", () => {
    const result = recommend({
      ...baseInput,
      morphoApyBps: 425,
      moonwellApyBps: 400,
      currentAllocation: "moonwell",
    });
    expect(result.recommended).toBe("morpho");
    expect(result.shouldMove).toBe(true);
    expect(result.apyDeltaBps).toBe(25);
  });

  it("does not recommend a move when the spread is just under the threshold", () => {
    const result = recommend({
      ...baseInput,
      morphoApyBps: 424,
      moonwellApyBps: 400,
      currentAllocation: "moonwell",
    });
    expect(result.shouldMove).toBe(false);
    expect(result.apyDeltaBps).toBe(0);
  });

  it("does not recommend a move when already in the best protocol", () => {
    const result = recommend({
      ...baseInput,
      morphoApyBps: 500,
      moonwellApyBps: 300,
      currentAllocation: "morpho",
    });
    expect(result.recommended).toBe("morpho");
    expect(result.shouldMove).toBe(false);
  });

  it("recommends a move from a 'none' starting allocation once above threshold", () => {
    const result = recommend({
      ...baseInput,
      morphoApyBps: 300,
      moonwellApyBps: 500,
      currentAllocation: "none",
    });
    expect(result.recommended).toBe("moonwell");
    expect(result.shouldMove).toBe(true);
    expect(result.apyDeltaBps).toBe(200);
  });

  it("recommends a move from a 'split' starting allocation once above threshold", () => {
    const result = recommend({
      ...baseInput,
      morphoApyBps: 600,
      moonwellApyBps: 300,
      currentAllocation: "split",
    });
    expect(result.recommended).toBe("morpho");
    expect(result.shouldMove).toBe(true);
    expect(result.apyDeltaBps).toBe(300);
  });

  it("flags a low-liquidity warning when the higher-APY protocol is thin on liquidity", () => {
    const result = recommend({
      ...baseInput,
      morphoApyBps: 400,
      moonwellApyBps: 13000,
      moonwellLiquidityRatio: 0.02,
      currentAllocation: "morpho",
    });
    expect(result.recommended).toBe("moonwell");
    expect(result.lowLiquidityWarning).toBe(true);
    expect(result.reason).toMatch(/thin/i);
  });

  it("does not flag a low-liquidity warning when the loser (not the recommended protocol) is thin", () => {
    const result = recommend({
      ...baseInput,
      morphoApyBps: 400,
      moonwellApyBps: 300,
      moonwellLiquidityRatio: 0.01,
      currentAllocation: "moonwell",
    });
    expect(result.recommended).toBe("morpho");
    expect(result.lowLiquidityWarning).toBe(false);
    expect(result.reason).not.toMatch(/thin/i);
  });

  it("includes the low-liquidity caveat even when already in the best (thin) protocol", () => {
    const result = recommend({
      ...baseInput,
      morphoApyBps: 400,
      moonwellApyBps: 13000,
      moonwellLiquidityRatio: 0.02,
      currentAllocation: "moonwell",
    });
    expect(result.shouldMove).toBe(false);
    expect(result.lowLiquidityWarning).toBe(true);
    expect(result.reason).toMatch(/thin/i);
  });

  it("does not warn when liquidity is exactly at the threshold", () => {
    const result = recommend({
      ...baseInput,
      morphoApyBps: 400,
      moonwellApyBps: 500,
      moonwellLiquidityRatio: 0.15,
      currentAllocation: "morpho",
    });
    expect(result.lowLiquidityWarning).toBe(false);
  });
});
