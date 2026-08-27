import type { Address } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AllocationFixture {
  supplyAssetsUsd: number;
  marketLiquidityUsd: number;
}

interface VaultFixture {
  address: string;
  name: string;
  listed: boolean;
  netApy: number;
  totalAssetsUsd: number;
  /** Defaults to a single fully-liquid market matching totalAssetsUsd. */
  allocation?: AllocationFixture[];
}

function mockGraphqlResponse(items: VaultFixture[]) {
  return {
    ok: true,
    json: async () => ({
      data: {
        vaults: {
          items: items.map((i) => ({
            address: i.address,
            name: i.name,
            listed: i.listed,
            state: {
              netApy: i.netApy,
              totalAssetsUsd: i.totalAssetsUsd,
              allocation: (
                i.allocation ?? [
                  { supplyAssetsUsd: i.totalAssetsUsd, marketLiquidityUsd: i.totalAssetsUsd },
                ]
              ).map((a) => ({
                supplyAssetsUsd: a.supplyAssetsUsd,
                market: { state: { liquidityAssetsUsd: a.marketLiquidityUsd } },
              })),
            },
          })),
        },
      },
    }),
  };
}

describe("morphoAdapter", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("filters out dust vaults below the TVL floor and picks the highest-APY eligible vault", async () => {
    // Mirrors real, live-observed behavior: a near-empty vault can report an
    // absurd APY (2979% at $8 TVL) while real, liquid vaults sit at 3-5%.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockGraphqlResponse([
          {
            address: "0xDust00000000000000000000000000000000001",
            name: "Dust Vault",
            listed: true,
            netApy: 29.8,
            totalAssetsUsd: 8,
          },
          {
            address: "0xReal00000000000000000000000000000000001",
            name: "Steakhouse USDC",
            listed: true,
            netApy: 0.033,
            totalAssetsUsd: 141_000_000,
          },
          {
            address: "0xReal00000000000000000000000000000000002",
            name: "Gauntlet USDC Prime",
            listed: true,
            netApy: 0.044,
            totalAssetsUsd: 436_000_000,
          },
        ])
      )
    );

    const { morphoAdapter } = await import("./morpho");
    const apy = await morphoAdapter.getApy();

    expect(apy.label).toBe("Gauntlet USDC Prime");
    expect(apy.apyBps).toBe(440);
    expect(apy.protocol).toBe("morpho");
  });

  it("excludes unlisted vaults even when APY and TVL look attractive", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockGraphqlResponse([
          {
            address: "0xUnlisted000000000000000000000000000001",
            name: "Unlisted High APY",
            listed: false,
            netApy: 0.09,
            totalAssetsUsd: 50_000_000,
          },
          {
            address: "0xListed0000000000000000000000000000001",
            name: "Steakhouse USDC",
            listed: true,
            netApy: 0.033,
            totalAssetsUsd: 141_000_000,
          },
        ])
      )
    );

    const { morphoAdapter } = await import("./morpho");
    const apy = await morphoAdapter.getApy();

    expect(apy.label).toBe("Steakhouse USDC");
  });

  it("throws when no vault clears the TVL floor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockGraphqlResponse([
          {
            address: "0xDust00000000000000000000000000000000002",
            name: "Dust Vault",
            listed: true,
            netApy: 29.8,
            totalAssetsUsd: 8,
          },
        ])
      )
    );

    const { morphoAdapter } = await import("./morpho");
    await expect(morphoAdapter.getApy()).rejects.toThrow();
  });

  it("reports a full liquidity ratio when the vault's markets can cover its whole supply", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockGraphqlResponse([
          {
            address: "0xLiquid00000000000000000000000000000001",
            name: "Steakhouse USDC",
            listed: true,
            netApy: 0.033,
            totalAssetsUsd: 100_000_000,
            allocation: [{ supplyAssetsUsd: 100_000_000, marketLiquidityUsd: 200_000_000 }],
          },
        ])
      )
    );

    const { morphoAdapter } = await import("./morpho");
    const apy = await morphoAdapter.getApy();

    // Capped at 1 even though the market's own liquidity exceeds the vault's supply.
    expect(apy.liquidityRatio).toBe(1);
  });

  it("caps a market's contribution at that market's own available liquidity, not the vault's allocation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockGraphqlResponse([
          {
            address: "0xThin000000000000000000000000000000001",
            name: "Thin Liquidity Vault",
            listed: true,
            netApy: 0.033,
            totalAssetsUsd: 100_000_000,
            // Vault supplied $100M into a market that only has $10M of liquidity —
            // at most $10M is actually withdrawable right now.
            allocation: [{ supplyAssetsUsd: 100_000_000, marketLiquidityUsd: 10_000_000 }],
          },
        ])
      )
    );

    const { morphoAdapter } = await import("./morpho");
    const apy = await morphoAdapter.getApy();

    expect(apy.liquidityRatio).toBeCloseTo(0.1, 5);
  });

  it("sums withdrawable liquidity across multiple underlying markets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockGraphqlResponse([
          {
            address: "0xMulti000000000000000000000000000000001",
            name: "Diversified Vault",
            listed: true,
            netApy: 0.033,
            totalAssetsUsd: 100_000_000,
            allocation: [
              { supplyAssetsUsd: 60_000_000, marketLiquidityUsd: 30_000_000 },
              { supplyAssetsUsd: 40_000_000, marketLiquidityUsd: 40_000_000 },
            ],
          },
        ])
      )
    );

    const { morphoAdapter } = await import("./morpho");
    const apy = await morphoAdapter.getApy();

    // min(60M,30M) + min(40M,40M) = 30M + 40M = 70M of 100M total.
    expect(apy.liquidityRatio).toBeCloseTo(0.7, 5);
  });

  it("builds a deposit tx as approve + deposit against the discovered vault", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockGraphqlResponse([
          {
            address: "0xVaultDep0000000000000000000000000000001",
            name: "Steakhouse USDC",
            listed: true,
            netApy: 0.033,
            totalAssetsUsd: 141_000_000,
          },
        ])
      )
    );

    const { morphoAdapter } = await import("./morpho");
    const user = "0x000000000000000000000000000000000000aa" as Address;
    const amount = 1_000_000n;

    const txs = await morphoAdapter.buildDepositTx(user, amount);

    expect(txs).toHaveLength(2);
    expect(txs[0].functionName).toBe("approve");
    expect(txs[0].args).toEqual(["0xVaultDep0000000000000000000000000000001", amount]);
    expect(txs[1].functionName).toBe("deposit");
    expect(txs[1].address).toBe("0xVaultDep0000000000000000000000000000001");
    expect(txs[1].args).toEqual([amount, user]);
  });

  it("builds a withdraw tx as a single asset-denominated withdraw call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockGraphqlResponse([
          {
            address: "0xVaultWd00000000000000000000000000000001",
            name: "Steakhouse USDC",
            listed: true,
            netApy: 0.033,
            totalAssetsUsd: 141_000_000,
          },
        ])
      )
    );

    const { morphoAdapter } = await import("./morpho");
    const user = "0x000000000000000000000000000000000000aa" as Address;
    const amount = 500_000n;

    const txs = await morphoAdapter.buildWithdrawTx(user, amount);

    expect(txs).toHaveLength(1);
    expect(txs[0].functionName).toBe("withdraw");
    expect(txs[0].address).toBe("0xVaultWd00000000000000000000000000000001");
    expect(txs[0].args).toEqual([amount, user, user]);
  });
});
