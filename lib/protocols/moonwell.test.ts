import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readContractMock } = vi.hoisted(() => ({
  readContractMock: vi.fn(),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({ readContract: readContractMock }),
  };
});

interface MarketFixture {
  ratePerSecond: bigint;
  cash: bigint;
  totalBorrows: bigint;
  totalReserves: bigint;
}

function mockMarket({ ratePerSecond, cash, totalBorrows, totalReserves }: MarketFixture) {
  readContractMock.mockImplementation(({ functionName }: { functionName: string }) => {
    switch (functionName) {
      case "supplyRatePerTimestamp":
        return Promise.resolve(ratePerSecond);
      case "getCash":
        return Promise.resolve(cash);
      case "totalBorrows":
        return Promise.resolve(totalBorrows);
      case "totalReserves":
        return Promise.resolve(totalReserves);
      default:
        return Promise.reject(new Error(`unexpected functionName: ${functionName}`));
    }
  });
}

describe("moonwellAdapter", () => {
  beforeEach(() => {
    readContractMock.mockReset();
  });

  it("computes APY from supplyRatePerTimestamp using compound interest", async () => {
    // Real observed value for this exact market (2026-08-27): rate ≈
    // 27735072134 / 1e18 per second compounds to ~139.8% APY.
    mockMarket({
      ratePerSecond: 27_735_072_134n,
      cash: 1n,
      totalBorrows: 13_257_361_188_045n,
      totalReserves: 23_675_616_034n,
    });

    const { moonwellAdapter } = await import("./moonwell");
    const apy = await moonwellAdapter.getApy();

    expect(apy.protocol).toBe("moonwell");
    expect(apy.label).toBe("Moonwell USDC");
    // ~139.8% APY == ~13980 bps; allow a little slack for floating point.
    expect(apy.apyBps).toBeGreaterThan(13_800);
    expect(apy.apyBps).toBeLessThan(14_100);
  });

  it("returns ~0 APY when the supply rate is 0", async () => {
    mockMarket({ ratePerSecond: 0n, cash: 1_000_000n, totalBorrows: 0n, totalReserves: 0n });

    const { moonwellAdapter } = await import("./moonwell");
    const apy = await moonwellAdapter.getApy();

    expect(apy.apyBps).toBe(0);
  });

  it("computes liquidityRatio as cash / (cash + totalBorrows - totalReserves)", async () => {
    mockMarket({
      ratePerSecond: 1_000_000n,
      cash: 25_000_000n,
      totalBorrows: 75_000_000n,
      totalReserves: 0n,
    });

    const { moonwellAdapter } = await import("./moonwell");
    const apy = await moonwellAdapter.getApy();

    // 25M / (25M + 75M - 0) = 0.25
    expect(apy.liquidityRatio).toBeCloseTo(0.25, 5);
  });

  it("reports near-zero liquidity for a fully-utilized market (the real Base USDC condition observed live)", async () => {
    mockMarket({
      ratePerSecond: 27_735_072_134n,
      cash: 1n,
      totalBorrows: 13_257_361_188_045n,
      totalReserves: 23_675_616_034n,
    });

    const { moonwellAdapter } = await import("./moonwell");
    const apy = await moonwellAdapter.getApy();

    expect(apy.liquidityRatio).toBeLessThan(0.001);
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
