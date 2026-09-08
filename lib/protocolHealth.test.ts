import { describe, expect, it } from "vitest";
import { getProtocolWarning, sortByHealth } from "./protocolHealth";
import type { ProtocolApy } from "./protocols/types";

function apy(protocol: ProtocolApy["protocol"], overrides: Partial<ProtocolApy> = {}): ProtocolApy {
  return {
    protocol,
    apyBps: 400,
    label: protocol,
    liquidityRatio: 1,
    contractAddress: "0x0000000000000000000000000000000000dEaD",
    ...overrides,
  };
}

describe("getProtocolWarning", () => {
  it("flags a disabled protocol as an incident, regardless of liquidity", () => {
    // moonwell is disabled in lib/config.ts's PROTOCOL_DEPOSITS_ENABLED
    expect(getProtocolWarning(apy("moonwell", { liquidityRatio: 1 }))).toBe("incident");
  });

  it("flags an enabled protocol with thin liquidity", () => {
    expect(getProtocolWarning(apy("aave", { liquidityRatio: 0.05 }))).toBe("low-liquidity");
  });

  it("returns null for a healthy, enabled, liquid protocol", () => {
    expect(getProtocolWarning(apy("aave", { liquidityRatio: 1 }))).toBeNull();
  });

  it("prefers the incident warning over low liquidity when both apply", () => {
    expect(getProtocolWarning(apy("moonwell", { liquidityRatio: 0.01 }))).toBe("incident");
  });
});

describe("sortByHealth", () => {
  it("moves warned protocols after healthy ones", () => {
    const list = [
      apy("moonwell"), // incident
      apy("morpho"), // healthy
      apy("aave", { liquidityRatio: 0.05 }), // low liquidity
      apy("compound"), // healthy
    ];
    expect(sortByHealth(list).map((a) => a.protocol)).toEqual([
      "morpho",
      "compound",
      "moonwell",
      "aave",
    ]);
  });

  it("preserves relative order within the healthy group and within the warned group", () => {
    // compound, morpho are healthy (in that order); moonwell, aave are warned
    // (moonwell: incident; aave overridden to thin liquidity so it's warned too).
    const withAaveWarned = [
      apy("compound"),
      apy("moonwell"),
      apy("morpho"),
      apy("aave", { liquidityRatio: 0.05 }),
    ];
    expect(sortByHealth(withAaveWarned).map((a) => a.protocol)).toEqual([
      "compound",
      "morpho",
      "moonwell",
      "aave",
    ]);
  });

  it("does not mutate the input array", () => {
    const list = [apy("moonwell"), apy("morpho")];
    const sorted = sortByHealth(list);
    expect(sorted).not.toBe(list);
    expect(list.map((a) => a.protocol)).toEqual(["moonwell", "morpho"]);
  });

  it("returns all protocols unharmed when none have warnings", () => {
    const list = [apy("aave"), apy("compound")];
    expect(sortByHealth(list).map((a) => a.protocol)).toEqual(["aave", "compound"]);
  });
});
