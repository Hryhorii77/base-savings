import { createMoonwellClient } from "@moonwell-fi/moonwell-sdk";
import type { Address } from "viem";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { MOONWELL_MUSDC_ADDRESS, USDC_ADDRESS } from "@/lib/config";
import type { ProtocolAdapter, ProtocolApy, TxRequest } from "./types";

// Moonwell's mUSDC is a Compound v2-style mToken, not ERC-4626 — different call
// shape from Morpho's vaults: mint()/redeemUnderlying() instead of deposit()/withdraw(),
// and Compound-style calls return a uint256 error code (0 = success) rather than
// reverting on failure, so callers should check the return value.
const mTokenAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [{ name: "mintAmount", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "redeemUnderlying",
    stateMutability: "nonpayable",
    inputs: [{ name: "redeemAmount", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  // balanceOfUnderlying accrues interest internally but has no side effects visible
  // to a caller that only ever reads via eth_call, so it's safe to treat as a read.
  {
    type: "function",
    name: "balanceOfUnderlying",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const erc20ApproveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const publicClient = createPublicClient({ chain: base, transport: http() });

const moonwellClient = createMoonwellClient({
  networks: { base: { rpcUrls: ["https://mainnet.base.org"] } },
});

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export const moonwellAdapter: ProtocolAdapter = {
  id: "moonwell",

  async getApy(): Promise<ProtocolApy> {
    const markets = await withTimeout(
      moonwellClient.getMarkets({ chainId: 8453 }),
      10_000,
      "Moonwell getMarkets"
    );
    const market = markets.find(
      (m) => m.marketKey === "MOONWELL_USDC" && !m.deprecated
    );
    if (!market) throw new Error("Moonwell USDC market not found on Base");

    // Verified live 2026-08-27: baseSupplyApy/rewards[].supplyApr are already
    // percentage numbers (e.g. 3.5 means 3.5%), NOT 0-1 fractions like Morpho's
    // netApy — do not apply the same *10000 conversion used for Morpho.
    const rewardsApy = market.rewards.reduce((sum, r) => sum + r.supplyApr, 0);
    const totalApyPercent = market.baseSupplyApy + rewardsApy;

    // cash = idle underlying sitting in the market, immediately withdrawable.
    // A Compound v2-style market at ~100% utilization has cash ≈ 0 even though
    // the position itself is solvent — observed live on this exact market.
    const liquidityRatio =
      market.totalSupply.value > 0 ? market.cash.value / market.totalSupply.value : 1;

    return {
      protocol: "moonwell",
      apyBps: Math.round(totalApyPercent * 100),
      label: "Moonwell USDC",
      liquidityRatio: Math.min(1, liquidityRatio),
    };
  },

  async getUserBalance(userAddress: Address): Promise<bigint> {
    return withTimeout(
      publicClient.readContract({
        address: MOONWELL_MUSDC_ADDRESS,
        abi: mTokenAbi,
        functionName: "balanceOfUnderlying",
        args: [userAddress],
      }),
      10_000,
      "Moonwell balanceOfUnderlying"
    );
  },

  async buildDepositTx(_userAddress: Address, amount: bigint): Promise<TxRequest[]> {
    return [
      {
        address: USDC_ADDRESS,
        abi: erc20ApproveAbi,
        functionName: "approve",
        args: [MOONWELL_MUSDC_ADDRESS, amount],
      },
      {
        address: MOONWELL_MUSDC_ADDRESS,
        abi: mTokenAbi,
        functionName: "mint",
        args: [amount],
      },
    ];
  },

  async buildWithdrawTx(_userAddress: Address, amount: bigint): Promise<TxRequest[]> {
    return [
      {
        address: MOONWELL_MUSDC_ADDRESS,
        abi: mTokenAbi,
        functionName: "redeemUnderlying",
        args: [amount],
      },
    ];
  },
};
