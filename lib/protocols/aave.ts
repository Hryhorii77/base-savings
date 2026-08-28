import type { Address } from "viem";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { AAVE_AUSDC_ADDRESS, AAVE_POOL_ADDRESS, BASE_RPC_URL, USDC_ADDRESS } from "@/lib/config";
import type { ProtocolAdapter, ProtocolApy, TxRequest } from "./types";

// Aave v3's Pool.getReserveData returns a large struct; we only need
// currentLiquidityRate and aTokenAddress, but the ABI must still describe the
// full tuple shape for viem to decode it correctly.
const poolAbi = [
  {
    type: "function",
    name: "getReserveData",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "configuration", type: "tuple", components: [{ name: "data", type: "uint256" }] },
          { name: "liquidityIndex", type: "uint128" },
          { name: "currentLiquidityRate", type: "uint128" },
          { name: "variableBorrowIndex", type: "uint128" },
          { name: "currentVariableBorrowRate", type: "uint128" },
          { name: "currentStableBorrowRate", type: "uint128" },
          { name: "lastUpdateTimestamp", type: "uint40" },
          { name: "id", type: "uint16" },
          { name: "aTokenAddress", type: "address" },
          { name: "stableDebtTokenAddress", type: "address" },
          { name: "variableDebtTokenAddress", type: "address" },
          { name: "interestRateStrategyAddress", type: "address" },
          { name: "accruedToTreasury", type: "uint128" },
          { name: "unbacked", type: "uint128" },
          { name: "isolationModeTotalDebt", type: "uint128" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "supply",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
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
      { name: "to", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

// aTokens are rebasing ERC-20s already 1:1 underlying-equivalent (6 decimals,
// matching USDC directly) — unlike Moonwell's mTokens, no exchange-rate
// conversion is needed to read a user's balance.
const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
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

const RAY = 10n ** 27n;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export const aaveAdapter: ProtocolAdapter = {
  id: "aave",

  async getApy(): Promise<ProtocolApy> {
    const [reserveData, cash] = await withTimeout(
      Promise.all([
        publicClient.readContract({
          address: AAVE_POOL_ADDRESS,
          abi: poolAbi,
          functionName: "getReserveData",
          args: [USDC_ADDRESS],
        }),
        publicClient.readContract({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [AAVE_AUSDC_ADDRESS],
        }),
      ]),
      10_000,
      "Aave getReserveData"
    );

    // currentLiquidityRate is a ray (1e27)-scaled linear APR, not a per-second
    // rate — convert to compounded APY the same way Aave's own UI does.
    const aprFraction = Number(reserveData.currentLiquidityRate) / Number(RAY);
    const apyFraction = (1 + aprFraction / SECONDS_PER_YEAR) ** SECONDS_PER_YEAR - 1;

    const totalSupply = await withTimeout(
      publicClient.readContract({
        address: AAVE_AUSDC_ADDRESS,
        abi: erc20Abi,
        functionName: "totalSupply",
      }),
      10_000,
      "Aave aToken totalSupply"
    );
    const liquidityRatio = totalSupply > 0n ? Number(cash) / Number(totalSupply) : 1;

    return {
      protocol: "aave",
      apyBps: Math.round(apyFraction * 10_000),
      label: "Aave USDC",
      liquidityRatio: Math.min(1, Math.max(0, liquidityRatio)),
    };
  },

  async getUserBalance(userAddress: Address): Promise<bigint> {
    return withTimeout(
      publicClient.readContract({
        address: AAVE_AUSDC_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [userAddress],
      }),
      10_000,
      "Aave aToken balanceOf"
    );
  },

  async buildDepositTx(userAddress: Address, amount: bigint): Promise<TxRequest[]> {
    return [
      {
        address: USDC_ADDRESS,
        abi: erc20ApproveAbi,
        functionName: "approve",
        args: [AAVE_POOL_ADDRESS, amount],
      },
      {
        address: AAVE_POOL_ADDRESS,
        abi: poolAbi,
        functionName: "supply",
        args: [USDC_ADDRESS, amount, userAddress, 0],
      },
    ];
  },

  async buildWithdrawTx(userAddress: Address, amount: bigint): Promise<TxRequest[]> {
    return [
      {
        address: AAVE_POOL_ADDRESS,
        abi: poolAbi,
        functionName: "withdraw",
        args: [USDC_ADDRESS, amount, userAddress],
      },
    ];
  },
};
