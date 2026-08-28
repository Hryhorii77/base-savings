import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMPOUND_COMET_ADDRESS, USDC_ADDRESS } from "@/lib/config";

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
  utilization: bigint;
  supplyRate: bigint;
  cash: bigint;
  totalSupply: bigint;
}

function mockMarket({ utilization, supplyRate, cash, totalSupply }: MarketFixture) {
  readContractMock.mockImplementation(
    ({ address, functionName }: { address: Address; functionName: string }) => {
      if (functionName === "getUtilization") return Promise.resolve(utilization);
      if (functionName === "getSupplyRate") return Promise.resolve(supplyRate);
      if (functionName === "balanceOf" && address === USDC_ADDRESS) return Promise.resolve(cash);
      if (functionName === "totalSupply") return Promise.resolve(totalSupply);
      return Promise.reject(new Error(`unexpected call: ${functionName} on ${address}`));
    }
  );
}

describe("compoundAdapter", () => {
  beforeEach(() => {
    readContractMock.mockReset();
  });

  it("computes APY from getSupplyRate using compound interest", async () => {
    // Real observed value for this exact market (2026-08-28): rate ≈
    // 1983451876 / 1e18 per second compounds to ~6.46% APY.
    mockMarket({
      utilization: 909_433_710_393_437_925n,
      supplyRate: 1_983_451_876n,
      cash: 1_504_791_091_939n,
      totalSupply: 9_218_081_960_839n,
    });

    const { compoundAdapter } = await import("./compound");
    const apy = await compoundAdapter.getApy();

    expect(apy.protocol).toBe("compound");
    expect(apy.label).toBe("Compound USDC");
    expect(apy.apyBps).toBeGreaterThan(630);
    expect(apy.apyBps).toBeLessThan(660);
  });

  it("returns ~0 APY when the supply rate is 0", async () => {
    mockMarket({ utilization: 0n, supplyRate: 0n, cash: 1_000_000n, totalSupply: 1_000_000n });

    const { compoundAdapter } = await import("./compound");
    const apy = await compoundAdapter.getApy();

    expect(apy.apyBps).toBe(0);
  });

  it("computes liquidityRatio as direct cash over totalSupply, not 1 - utilization", async () => {
    // Deliberately mismatched utilization vs the cash/totalSupply ratio, to
    // assert the adapter uses the direct cash reading (as verified live —
    // Comet's utilization isn't a pure borrow/supply ratio) rather than
    // deriving liquidity from `1 - utilization`.
    mockMarket({
      utilization: 900_000_000_000_000_000n, // would imply ~10% liquidity if misused
      supplyRate: 0n,
      cash: 25_000_000n,
      totalSupply: 100_000_000n, // cash/totalSupply = 25%, not 10%
    });

    const { compoundAdapter } = await import("./compound");
    const apy = await compoundAdapter.getApy();

    expect(apy.liquidityRatio).toBeCloseTo(0.25, 5);
  });

  it("reads the user's balance directly via Comet.balanceOf", async () => {
    readContractMock.mockResolvedValue(3_300_000n);

    const { compoundAdapter } = await import("./compound");
    const user = "0x000000000000000000000000000000000000aa" as Address;
    const balance = await compoundAdapter.getUserBalance(user);

    expect(balance).toBe(3_300_000n);
    expect(readContractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        address: COMPOUND_COMET_ADDRESS,
        functionName: "balanceOf",
        args: [user],
      })
    );
  });

  it("builds a deposit tx as approve + Comet.supply(asset, amount)", async () => {
    const { compoundAdapter } = await import("./compound");
    const user = "0x000000000000000000000000000000000000aa" as Address;
    const amount = 1_000_000n;

    const txs = await compoundAdapter.buildDepositTx(user, amount);

    expect(txs).toHaveLength(2);
    expect(txs[0].functionName).toBe("approve");
    expect(txs[1].functionName).toBe("supply");
    expect(txs[1].args).toEqual([USDC_ADDRESS, amount]);
  });

  it("builds a withdraw tx as a single Comet.withdraw(asset, amount) call", async () => {
    const { compoundAdapter } = await import("./compound");
    const user = "0x000000000000000000000000000000000000aa" as Address;
    const amount = 750_000n;

    const txs = await compoundAdapter.buildWithdrawTx(user, amount);

    expect(txs).toHaveLength(1);
    expect(txs[0].functionName).toBe("withdraw");
    expect(txs[0].args).toEqual([USDC_ADDRESS, amount]);
  });
});
