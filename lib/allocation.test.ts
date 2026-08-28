import { describe, expect, it } from "vitest";
import { recommend, type ProtocolSnapshot } from "./allocation";

const baseOptions = { minMoveThresholdBps: 25, lowLiquidityThreshold: 0.15 };

function snap(
  protocol: ProtocolSnapshot["protocol"],
  apyBps: number,
  overrides: Partial<ProtocolSnapshot> = {}
): ProtocolSnapshot {
  return { protocol, apyBps, liquidityRatio: 1, depositsEnabled: true, ...overrides };
}

describe("recommend", () => {
  it("does not recommend a move when APYs are equal", () => {
    const result = recommend({
      ...baseOptions,
      protocols: [snap("morpho", 400), snap("moonwell", 400)],
      heldProtocols: [],
    });
    expect(result.shouldMove).toBe(false);
    expect(result.apyDeltaBps).toBe(0);
  });

  it("recommends a move when the spread exactly equals the threshold", () => {
    const result = recommend({
      ...baseOptions,
      protocols: [snap("morpho", 425), snap("moonwell", 400)],
      heldProtocols: ["moonwell"],
    });
    expect(result.recommended).toBe("morpho");
    expect(result.shouldMove).toBe(true);
    expect(result.apyDeltaBps).toBe(25);
  });

  it("does not recommend a move when the spread is just under the threshold", () => {
    const result = recommend({
      ...baseOptions,
      protocols: [snap("morpho", 424), snap("moonwell", 400)],
      heldProtocols: ["moonwell"],
    });
    expect(result.shouldMove).toBe(false);
    expect(result.apyDeltaBps).toBe(0);
  });

  it("does not recommend a move when already in the best protocol", () => {
    const result = recommend({
      ...baseOptions,
      protocols: [snap("morpho", 500), snap("moonwell", 300)],
      heldProtocols: ["morpho"],
    });
    expect(result.recommended).toBe("morpho");
    expect(result.shouldMove).toBe(false);
  });

  it("recommends a move from holding nothing once above threshold", () => {
    const result = recommend({
      ...baseOptions,
      protocols: [snap("morpho", 300), snap("moonwell", 500)],
      heldProtocols: [],
    });
    expect(result.recommended).toBe("moonwell");
    expect(result.shouldMove).toBe(true);
    expect(result.apyDeltaBps).toBe(200);
  });

  it("recommends a move when holding a split position across protocols", () => {
    const result = recommend({
      ...baseOptions,
      protocols: [snap("morpho", 600), snap("moonwell", 300)],
      heldProtocols: ["morpho", "moonwell"],
    });
    expect(result.recommended).toBe("morpho");
    expect(result.shouldMove).toBe(true);
    expect(result.apyDeltaBps).toBe(300);
  });

  it("flags a low-liquidity warning when the recommended protocol is thin on liquidity", () => {
    const result = recommend({
      ...baseOptions,
      protocols: [snap("morpho", 400), snap("moonwell", 13000, { liquidityRatio: 0.02 })],
      heldProtocols: ["morpho"],
    });
    expect(result.recommended).toBe("moonwell");
    expect(result.lowLiquidityWarning).toBe(true);
    expect(result.reason).toMatch(/thin/i);
  });

  it("does not flag a low-liquidity warning when a non-recommended protocol is thin", () => {
    const result = recommend({
      ...baseOptions,
      protocols: [snap("morpho", 400), snap("moonwell", 300, { liquidityRatio: 0.01 })],
      heldProtocols: ["moonwell"],
    });
    expect(result.recommended).toBe("morpho");
    expect(result.lowLiquidityWarning).toBe(false);
    expect(result.reason).not.toMatch(/thin/i);
  });

  it("includes the low-liquidity caveat even when already in the best (thin) protocol", () => {
    const result = recommend({
      ...baseOptions,
      protocols: [snap("morpho", 400), snap("moonwell", 13000, { liquidityRatio: 0.02 })],
      heldProtocols: ["moonwell"],
    });
    expect(result.shouldMove).toBe(false);
    expect(result.lowLiquidityWarning).toBe(true);
    expect(result.reason).toMatch(/thin/i);
  });

  it("does not warn when liquidity is exactly at the threshold", () => {
    const result = recommend({
      ...baseOptions,
      protocols: [snap("morpho", 400), snap("moonwell", 500, { liquidityRatio: 0.15 })],
      heldProtocols: ["morpho"],
    });
    expect(result.lowLiquidityWarning).toBe(false);
  });

  it("urges withdrawal when already holding a protocol with deposits disabled", () => {
    const result = recommend({
      ...baseOptions,
      protocols: [snap("morpho", 400), snap("moonwell", 13000, { depositsEnabled: false })],
      heldProtocols: ["moonwell"],
    });
    expect(result.recommended).toBe("morpho");
    expect(result.shouldMove).toBe(true);
    expect(result.incidentWarning).toBe(true);
    expect(result.reason).toMatch(/security incident/i);
  });

  it("urges withdrawal from a disabled protocol even when held as part of a split position", () => {
    const result = recommend({
      ...baseOptions,
      protocols: [snap("morpho", 400), snap("moonwell", 300, { depositsEnabled: false })],
      heldProtocols: ["morpho", "moonwell"],
    });
    expect(result.recommended).toBe("morpho");
    expect(result.shouldMove).toBe(true);
    expect(result.incidentWarning).toBe(true);
  });

  it("recommends the best enabled protocol instead of a higher-APY disabled one for a new depositor", () => {
    const result = recommend({
      ...baseOptions,
      protocols: [snap("morpho", 400), snap("moonwell", 13000, { depositsEnabled: false })],
      heldProtocols: [],
    });
    expect(result.recommended).toBe("morpho");
    expect(result.shouldMove).toBe(true);
    expect(result.incidentWarning).toBe(true);
    expect(result.reason).toMatch(/security incident/i);
  });

  it("does not repeat the incident reason once already in the best enabled protocol", () => {
    const result = recommend({
      ...baseOptions,
      protocols: [snap("morpho", 400), snap("moonwell", 13000, { depositsEnabled: false })],
      heldProtocols: ["morpho"],
    });
    expect(result.recommended).toBe("morpho");
    expect(result.shouldMove).toBe(false);
    expect(result.incidentWarning).toBe(true);
  });

  it("ignores a disabled protocol entirely when an enabled one already wins on APY", () => {
    const result = recommend({
      ...baseOptions,
      protocols: [snap("morpho", 500), snap("moonwell", 300, { depositsEnabled: false })],
      heldProtocols: [],
    });
    expect(result.recommended).toBe("morpho");
    expect(result.incidentWarning).toBe(false);
    expect(result.reason).not.toMatch(/security incident/i);
  });

  it("picks the single highest-APY protocol across more than two options", () => {
    const result = recommend({
      ...baseOptions,
      protocols: [snap("morpho", 400), snap("moonwell", 300), snap("aave", 350), snap("compound", 650)],
      heldProtocols: ["morpho"],
    });
    expect(result.recommended).toBe("compound");
    expect(result.apyDeltaBps).toBe(250); // 650 - 400 (currently held)
  });

  it("does not treat a 3-way split as 'already there' even if it includes the best protocol", () => {
    const result = recommend({
      ...baseOptions,
      protocols: [snap("morpho", 400), snap("moonwell", 300), snap("aave", 350), snap("compound", 650)],
      heldProtocols: ["morpho", "moonwell", "compound"],
    });
    expect(result.recommended).toBe("compound");
    expect(result.shouldMove).toBe(true);
  });
});
