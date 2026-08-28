import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AAVE_AUSDC_ADDRESS, USDC_ADDRESS } from "@/lib/config";

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

const RAY = 10n ** 27n;

interface ReserveFixture {
  liquidityRateRay: bigint;
  cash: bigint;
  totalSupply: bigint;
}

function mockReserve({ liquidityRateRay, cash, totalSupply }: ReserveFixture) {
  readContractMock.mockImplementation(
    ({ address, functionName }: { address: Address; functionName: string }) => {
      if (functionName === "getReserveData") {
        return Promise.resolve({ currentLiquidityRate: liquidityRateRay, aTokenAddress: AAVE_AUSDC_ADDRESS });
      }
      if (functionName === "balanceOf" && address === USDC_ADDRESS) {
        return Promise.resolve(cash);
      }
      if (functionName === "totalSupply") {
        return Promise.resolve(totalSupply);
      }
      return Promise.reject(new Error(`unexpected call: ${functionName} on ${address}`));
    }
  );
}

describe("aaveAdapter", () => {
  beforeEach(() => {
    readContractMock.mockReset();
  });

  it("converts the ray-scaled linear APR to a compounded APY", async () => {
    // 5% linear APR compounds to ~5.127% APY (e^0.05 - 1).
    mockReserve({ liquidityRateRay: (RAY * 5n) / 100n, cash: 1n, totalSupply: 1n });

    const { aaveAdapter } = await import("./aave");
    const apy = await aaveAdapter.getApy();

    expect(apy.protocol).toBe("aave");
    expect(apy.label).toBe("Aave USDC");
    expect(apy.apyBps).toBeGreaterThan(510);
    expect(apy.apyBps).toBeLessThan(515);
  });

  it("computes liquidityRatio as cash held by the aToken over its total supply", async () => {
    mockReserve({ liquidityRateRay: 0n, cash: 25_000_000n, totalSupply: 100_000_000n });

    const { aaveAdapter } = await import("./aave");
    const apy = await aaveAdapter.getApy();

    expect(apy.liquidityRatio).toBeCloseTo(0.25, 5);
  });

  it("reads the user's aToken balance directly (no exchange-rate conversion)", async () => {
    readContractMock.mockResolvedValue(4_200_000n);

    const { aaveAdapter } = await import("./aave");
    const user = "0x000000000000000000000000000000000000aa" as Address;
    const balance = await aaveAdapter.getUserBalance(user);

    expect(balance).toBe(4_200_000n);
    expect(readContractMock).toHaveBeenCalledWith(
      expect.objectContaining({ address: AAVE_AUSDC_ADDRESS, functionName: "balanceOf", args: [user] })
    );
  });

  it("builds a deposit tx as approve + Pool.supply with referralCode 0", async () => {
    const { aaveAdapter } = await import("./aave");
    const user = "0x000000000000000000000000000000000000aa" as Address;
    const amount = 1_000_000n;

    const txs = await aaveAdapter.buildDepositTx(user, amount);

    expect(txs).toHaveLength(2);
    expect(txs[0].functionName).toBe("approve");
    expect(txs[1].functionName).toBe("supply");
    expect(txs[1].args).toEqual([USDC_ADDRESS, amount, user, 0]);
  });

  it("builds a withdraw tx as a single Pool.withdraw call", async () => {
    const { aaveAdapter } = await import("./aave");
    const user = "0x000000000000000000000000000000000000aa" as Address;
    const amount = 500_000n;

    const txs = await aaveAdapter.buildWithdrawTx(user, amount);

    expect(txs).toHaveLength(1);
    expect(txs[0].functionName).toBe("withdraw");
    expect(txs[0].args).toEqual([USDC_ADDRESS, amount, user]);
  });
});
