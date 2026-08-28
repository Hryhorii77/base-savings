import type { Address } from "viem";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { BASE_RPC_URL, COMPOUND_COMET_ADDRESS, USDC_ADDRESS } from "@/lib/config";
import type { ProtocolAdapter, ProtocolApy, TxRequest } from "./types";

// Compound III (Comet) is a single-base-asset money market — this Comet
// deployment's base asset is USDC (verified live via baseToken()). supply()/
// withdraw() take an `asset` param because the same entrypoint also handles
// collateral assets, but passing the base asset itself works directly.
const cometAbi = [
  {
    type: "function",
    name: "getUtilization",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getSupplyRate",
    stateMutability: "view",
    inputs: [{ name: "utilization", type: "uint256" }],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  // Already base-asset-denominated (confirmed live: totalSupply() returns a
  // plain 6-decimal USDC-scale number, not an 18-decimal share count), so no
  // exchange-rate conversion is needed to read a user's balance.
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "supply",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
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

const publicClient = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export const compoundAdapter: ProtocolAdapter = {
  id: "compound",

  async getApy(): Promise<ProtocolApy> {
    const utilization = await withTimeout(
      publicClient.readContract({
        address: COMPOUND_COMET_ADDRESS,
        abi: cometAbi,
        functionName: "getUtilization",
      }),
      10_000,
      "Compound getUtilization"
    );
    const [supplyRate, cash, totalSupply] = await withTimeout(
      Promise.all([
        publicClient.readContract({
          address: COMPOUND_COMET_ADDRESS,
          abi: cometAbi,
          functionName: "getSupplyRate",
          args: [utilization],
        }),
        publicClient.readContract({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [COMPOUND_COMET_ADDRESS],
        }),
        publicClient.readContract({
          address: COMPOUND_COMET_ADDRESS,
          abi: cometAbi,
          functionName: "totalSupply",
        }),
      ]),
      10_000,
      "Compound getSupplyRate/cash/totalSupply"
    );

    // Per-second rate, 1e18-scaled — same shape and formula as Moonwell's
    // supplyRatePerTimestamp (lib/protocols/moonwell.ts).
    const ratePerSecondFraction = Number(supplyRate) / 1e18;
    const apyFraction = (1 + ratePerSecondFraction) ** SECONDS_PER_YEAR - 1;

    // Direct cash-based liquidity, consistent with Aave/Moonwell — NOT
    // `1 - utilization`, which disagreed with the direct cash reading by
    // several percentage points when verified live (Comet's utilization
    // isn't a pure borrow/supply ratio).
    const liquidityRatio = totalSupply > 0n ? Number(cash) / Number(totalSupply) : 1;

    return {
      protocol: "compound",
      apyBps: Math.round(apyFraction * 10_000),
      label: "Compound USDC",
      liquidityRatio: Math.min(1, Math.max(0, liquidityRatio)),
    };
  },

  async getUserBalance(userAddress: Address): Promise<bigint> {
    return withTimeout(
      publicClient.readContract({
        address: COMPOUND_COMET_ADDRESS,
        abi: cometAbi,
        functionName: "balanceOf",
        args: [userAddress],
      }),
      10_000,
      "Compound balanceOf"
    );
  },

  async buildDepositTx(_userAddress: Address, amount: bigint): Promise<TxRequest[]> {
    return [
      {
        address: USDC_ADDRESS,
        abi: erc20ApproveAbi,
        functionName: "approve",
        args: [COMPOUND_COMET_ADDRESS, amount],
      },
      {
        address: COMPOUND_COMET_ADDRESS,
        abi: cometAbi,
        functionName: "supply",
        args: [USDC_ADDRESS, amount],
      },
    ];
  },

  async buildWithdrawTx(_userAddress: Address, amount: bigint): Promise<TxRequest[]> {
    return [
      {
        address: COMPOUND_COMET_ADDRESS,
        abi: cometAbi,
        functionName: "withdraw",
        args: [USDC_ADDRESS, amount],
      },
    ];
  },
};
