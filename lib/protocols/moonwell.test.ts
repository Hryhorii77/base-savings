import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMarketsMock, readContractMock } = vi.hoisted(() => ({
  getMarketsMock: vi.fn(),
  readContractMock: vi.fn(),
}));

vi.mock("@moonwell-fi/moonwell-sdk", () => ({
  createMoonwellClient: () => ({ getMarkets: getMarketsMock }),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({ readContract: readContractMock }),
  };
});

function makeMarket(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    marketKey: "MOONWELL_USDC",
    deprecated: false,
    underlyingToken: { symbol: "USDC" },
    baseSupplyApy: 3.5,
    totalSupplyApr: 3.4,
    rewards: [{ token: { symbol: "WELL" }, supplyApr: 0.5 }],
    cash: { value: 5_000_000 },
    totalSupply: { value: 10_000_000 },
    ...overrides,
  };
}

describe("moonwellAdapter", () => {
  beforeEach(() => {
    getMarketsMock.mockReset();
    readContractMock.mockReset();
  });

  it("converts baseSupplyApy + reward APRs (already percentages, not fractions) into bps", async () => {
    getMarketsMock.mockResolvedValue([makeMarket({ baseSupplyApy: 3.5, rewards: [{ supplyApr: 0.5 }] })]);

    const { moonwellAdapter } = await import("./moonwell");
    const apy = await moonwellAdapter.getApy();

    // 3.5% base + 0.5% reward = 4.0% = 400 bps
    expect(apy.apyBps).toBe(400);
    expect(apy.protocol).toBe("moonwell");
    expect(apy.label).toBe("Moonwell USDC");
  });

  it("sums multiple reward tokens into the total APY", async () => {
    getMarketsMock.mockResolvedValue([
      makeMarket({ baseSupplyApy: 2, rewards: [{ supplyApr: 0.3 }, { supplyApr: 0.2 }] }),
    ]);

    const { moonwellAdapter } = await import("./moonwell");
    const apy = await moonwellAdapter.getApy();

    expect(apy.apyBps).toBe(250);
  });

  it("ignores a deprecated MOONWELL_USDC entry and throws if no active one exists", async () => {
    getMarketsMock.mockResolvedValue([makeMarket({ deprecated: true })]);

    const { moonwellAdapter } = await import("./moonwell");
    await expect(moonwellAdapter.getApy()).rejects.toThrow();
  });

  it("throws when no MOONWELL_USDC market is present", async () => {
    getMarketsMock.mockResolvedValue([makeMarket({ marketKey: "MOONWELL_ETH" })]);

    const { moonwellAdapter } = await import("./moonwell");
    await expect(moonwellAdapter.getApy()).rejects.toThrow();
  });

  it("computes liquidityRatio as cash over totalSupply", async () => {
    getMarketsMock.mockResolvedValue([
      makeMarket({ cash: { value: 2_500_000 }, totalSupply: { value: 10_000_000 } }),
    ]);

    const { moonwellAdapter } = await import("./moonwell");
    const apy = await moonwellAdapter.getApy();

    expect(apy.liquidityRatio).toBeCloseTo(0.25, 5);
  });

  it("reports near-zero liquidity for a fully-utilized market (the real Base USDC condition observed live)", async () => {
    getMarketsMock.mockResolvedValue([
      makeMarket({
        baseSupplyApy: 139.42,
        rewards: [{ supplyApr: 0.07 }],
        cash: { value: 0 },
        totalSupply: { value: 13_288_846 },
      }),
    ]);

    const { moonwellAdapter } = await import("./moonwell");
    const apy = await moonwellAdapter.getApy();

    expect(apy.liquidityRatio).toBe(0);
    expect(apy.apyBps).toBeGreaterThan(10_000); // a real >100% APY market condition
  });

  it("reads the user's underlying balance via balanceOfUnderlying", async () => {
    readContractMock.mockResolvedValue(1_500_000n);

    const { moonwellAdapter } = await import("./moonwell");
    const user = "0x000000000000000000000000000000000000aa" as Address;
    const balance = await moonwellAdapter.getUserBalance(user);

    expect(balance).toBe(1_500_000n);
    expect(readContractMock).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "balanceOfUnderlying", args: [user] })
    );
  });

  it("builds a deposit tx as approve + mint", async () => {
    const { moonwellAdapter } = await import("./moonwell");
    const user = "0x000000000000000000000000000000000000aa" as Address;
    const amount = 1_000_000n;

    const txs = await moonwellAdapter.buildDepositTx(user, amount);

    expect(txs).toHaveLength(2);
    expect(txs[0].functionName).toBe("approve");
    expect(txs[1].functionName).toBe("mint");
    expect(txs[1].args).toEqual([amount]);
  });

  it("builds a withdraw tx as a single redeemUnderlying call", async () => {
    const { moonwellAdapter } = await import("./moonwell");
    const user = "0x000000000000000000000000000000000000aa" as Address;
    const amount = 750_000n;

    const txs = await moonwellAdapter.buildWithdrawTx(user, amount);

    expect(txs).toHaveLength(1);
    expect(txs[0].functionName).toBe("redeemUnderlying");
    expect(txs[0].args).toEqual([amount]);
  });
});
